import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateFileSchema, newUuid } from '@project/core';
import { HttpSpaceBackend } from '@project/http';
import { afterEach, describe, expect, it } from 'vitest';
import { readSingleSpace } from '../../src/aggregate-directory';
import { initAggregate } from '../../src/run/run';
import { runCommand } from '../support/hyper-command';

/**
 * `pnpm hyper init` and `pnpm hyper run` as an author runs them: their own
 * process, a directory of their own, one edit over HTTP and a signal
 * (ADR 0117, ADR 0124). Nothing here needs a database.
 */

const START_TIMEOUT_MS = 60_000;
const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') reject(new Error('No port'));
        else resolve(address.port);
      });
    });
  });

/**
 * The `hyper` script's command line, so the launcher can run without pnpm in
 * front of it. The script must `exec` node, for the reason
 * `src/cli/run-launcher.ts` gives.
 */
const hyperScript = async (): Promise<readonly string[]> => {
  const manifest: unknown = JSON.parse(
    await readFile(join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  const script =
    typeof manifest === 'object' &&
    manifest !== null &&
    'scripts' in manifest &&
    typeof manifest.scripts === 'object' &&
    manifest.scripts !== null &&
    'hyper' in manifest.scripts &&
    typeof manifest.scripts.hyper === 'string'
      ? manifest.scripts.hyper
      : '';
  const [exec, command, ...args] = script.split(' ');
  if (exec !== 'exec' || command !== 'node') {
    throw new Error(`Expected the hyper script to exec node: ${script}`);
  }
  return args;
};

/** Resolves once the launcher `pid` has started its run process. */
const runProcessStarted = async (pid: number): Promise<void> => {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const children = await runCommand('pgrep', ['-P', String(pid)]);
    if (children.stdout.trim() !== '') return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('The launcher never started its run process');
};

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * Start a run on a new directory, in a process group of its own so a signal
 * reaches every process in it together, as a terminal's does. `pnpm` runs it
 * as an author does; `launcher` runs the launcher with nothing in front of it.
 */
const startRunning = async (via: 'pnpm' | 'launcher') => {
  const root = await mkdtemp(join(tmpdir(), 'hyper-run-'));
  roots.push(root);
  const directory = join(root, 'talk');
  await initAggregate(directory, newUuid);
  const port = await freePort();
  const runArguments = ['run', directory, '--no-open', '--port', String(port)];
  const child =
    via === 'pnpm'
      ? spawn('pnpm', ['--silent', 'hyper', ...runArguments], {
          cwd: REPOSITORY_ROOT,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(process.execPath, [...(await hyperScript()), ...runArguments], {
          cwd: REPOSITORY_ROOT,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
  let output = '';
  const readers = new Set<() => void>();
  const read = (chunk: string): void => {
    output += chunk;
    for (const reader of readers) reader();
  };
  child.stdout.setEncoding('utf8').on('data', read);
  child.stderr.setEncoding('utf8').on('data', read);
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  const signal = (name: NodeJS.Signals): void => {
    if (child.pid !== undefined) process.kill(-child.pid, name);
  };
  /** Resolves as the output arrives, so a test can act while the run is still stopping. */
  const outputContaining = (text: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const reader = (): void => {
        if (!output.includes(text)) return;
        readers.delete(reader);
        resolve();
      };
      readers.add(reader);
      reader();
      void exited.then(() => {
        if (readers.delete(reader)) reject(new Error(`Exited before printing ${text}:\n${output}`));
      });
    });
  const kill = (): void => {
    if (child.exitCode === null && child.signalCode === null) signal('SIGKILL');
  };

  await outputContaining(`http://localhost:${String(port)}/`);
  const { metaSpaceId } = aggregateFileSchema.parse(
    JSON.parse(await readFile(join(directory, 'hyper.json'), 'utf8')),
  );

  /** Rename the Meta Space over HTTP, exactly as the browser commits. */
  const rename = async (title: string): Promise<void> => {
    const backend = new HttpSpaceBackend(`http://localhost:${String(port)}`);
    const loaded = await backend.loadSpace(metaSpaceId);
    if (loaded === undefined) throw new Error('Expected the Meta Space');
    const committed = await backend.commit({
      changes: [
        {
          kind: 'update',
          spaceId: metaSpaceId,
          snapshot: { ...loaded.snapshot, document: { ...loaded.snapshot.document, title } },
          expectedRevision: loaded.revision,
        },
      ],
    });
    expect(committed.kind).toBe('committed');
  };
  const writtenTitle = async (): Promise<string> =>
    (await readSingleSpace(join(directory, metaSpaceId))).document.title;

  return {
    child,
    exited,
    output: () => output,
    outputContaining,
    signal,
    kill,
    rename,
    writtenTitle,
  };
};

describe('pnpm hyper init', () => {
  it(
    'writes a new aggregate to a relative directory from where pnpm was invoked, and prints the run command',
    async () => {
      // The real path, which is the directory pnpm records as where it was invoked.
      const root = await realpath(await mkdtemp(join(tmpdir(), 'hyper-init-')));
      roots.push(root);
      const directory = join(root, 'talk');

      const result = await runCommand(
        'pnpm',
        ['--silent', '--dir', REPOSITORY_ROOT, 'hyper', 'init', 'talk'],
        { cwd: root, timeoutMs: START_TIMEOUT_MS },
      );

      expect(result, result.stderr).toMatchObject({ status: 0, stderr: '' });
      expect(result.stdout).toBe(
        `Created a new aggregate; run it with: pnpm hyper run ${directory}\n`,
      );
      const { metaSpaceId } = aggregateFileSchema.parse(
        JSON.parse(await readFile(join(directory, 'hyper.json'), 'utf8')),
      );
      expect((await readSingleSpace(join(directory, metaSpaceId))).document.title).toBe(
        'New space',
      );
    },
    START_TIMEOUT_MS,
  );
});

describe('pnpm hyper run', () => {
  it(
    'refuses a missing directory, naming init, and writes nothing',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'hyper-run-'));
      roots.push(root);
      const directory = join(root, 'rust-asycn');

      const result = await runCommand(
        'pnpm',
        ['--silent', 'hyper', 'run', directory, '--no-open'],
        {
          cwd: REPOSITORY_ROOT,
          timeoutMs: START_TIMEOUT_MS,
        },
      );

      expect(result.status, result.stderr).not.toBe(0);
      expect(result.stderr).toContain(`pnpm hyper init ${directory}`);
      expect(await exists(directory)).toBe(false);
    },
    START_TIMEOUT_MS,
  );

  it(
    'refuses a port already in use with a sentence, exiting one',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'hyper-run-'));
      roots.push(root);
      const directory = join(root, 'talk');
      await initAggregate(directory, newUuid);
      // Held on `localhost`, the address the run's server binds.
      const occupied = createServer();
      await new Promise<void>((resolve) => occupied.listen(0, 'localhost', resolve));
      const address = occupied.address();
      if (address === null || typeof address === 'string') throw new Error('No port');
      try {
        const result = await runCommand(
          process.execPath,
          [...(await hyperScript()), 'run', directory, '--no-open', '--port', String(address.port)],
          { cwd: REPOSITORY_ROOT, timeoutMs: START_TIMEOUT_MS },
        );

        expect(result.status, result.stderr).toBe(1);
        // One sentence and no stack trace.
        const [sentence, ...rest] = result.stderr.split('\n');
        expect(sentence, result.stderr).toMatch(
          `Could not serve ${directory} on port ${String(address.port)}: `,
        );
        expect(rest, result.stderr).toEqual(['']);
      } finally {
        await new Promise((resolve) => occupied.close(resolve));
      }
    },
    START_TIMEOUT_MS,
  );

  /*
   * The launcher forwards a signal it receives as soon as the run process
   * exists, which is before that process has loaded or Imported anything.
   */
  it(
    'stops, exiting zero and leaving the directory as it was, on SIGINT while it is still starting',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'hyper-run-'));
      roots.push(root);
      const directory = join(root, 'talk');
      await initAggregate(directory, newUuid);
      const before = await readFile(join(directory, 'hyper.json'), 'utf8');
      const launcher = spawn(
        process.execPath,
        [
          ...(await hyperScript()),
          'run',
          directory,
          '--no-open',
          '--port',
          String(await freePort()),
        ],
        { cwd: REPOSITORY_ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let output = '';
      launcher.stdout.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
      launcher.stderr.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
      const exited = new Promise<number | null>((resolve) => launcher.once('exit', resolve));
      try {
        const pid = launcher.pid;
        if (pid === undefined) throw new Error('The launcher did not start');
        await runProcessStarted(pid);
        process.kill(-pid, 'SIGINT');

        expect(await exited, output).toBe(0);
        expect(output).toContain('Stopped');
        expect(await readFile(join(directory, 'hyper.json'), 'utf8')).toBe(before);
      } finally {
        if (launcher.exitCode === null && launcher.signalCode === null && launcher.pid) {
          process.kill(-launcher.pid, 'SIGKILL');
        }
      }
    },
    START_TIMEOUT_MS,
  );

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'serves a directory, writes an edit and exits zero on %s',
    async (name) => {
      const running = await startRunning('pnpm');
      try {
        await running.rename('Written before exit');

        running.signal(name);
        expect(await running.exited, running.output()).toBe(0);
        expect(await running.writtenTitle()).toBe('Written before exit');
      } finally {
        running.kill();
      }
    },
    START_TIMEOUT_MS * 2,
  );

  it(
    'exits at once, non-zero, on a second SIGINT while it is stopping',
    async () => {
      const running = await startRunning('pnpm');
      try {
        await running.rename('Pending when the second signal arrives');

        running.signal('SIGINT');
        await running.outputContaining('Stopping');
        running.signal('SIGINT');

        expect(await running.exited, running.output()).not.toBe(0);
        expect(running.output()).toContain('Exiting without waiting for the last write.');
      } finally {
        running.kill();
      }
    },
    START_TIMEOUT_MS * 2,
  );

  /*
   * Closing a terminal sends SIGHUP and leaves nothing to print to. The reader
   * here goes before the signal, so the run's last messages fail to write; the
   * edit must land and the run exit zero regardless. pnpm itself dies of
   * SIGHUP, so the launcher runs without it to answer for the run's exit.
   */
  it(
    'writes an edit and exits zero on SIGHUP with no one left to read its output',
    async () => {
      const running = await startRunning('launcher');
      try {
        await running.rename('Written after the terminal closed');

        running.child.stdout.destroy();
        running.child.stderr.destroy();
        running.signal('SIGHUP');

        expect(await running.exited).toBe(0);
        expect(await running.writtenTitle()).toBe('Written after the terminal closed');
      } finally {
        running.kill();
      }
    },
    START_TIMEOUT_MS * 2,
  );
});
