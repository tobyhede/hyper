import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateFileSchema } from '@project/core';
import { HttpSpaceBackend } from '@project/http';
import { afterEach, describe, expect, it } from 'vitest';
import { readSingleSpace } from '../../src/aggregate-directory';

/**
 * `pnpm start` as an author runs it: its own process, a directory of its own,
 * one edit over HTTP and a signal (ADR 0117). Nothing here needs a database.
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
 * The `start` script's command line, so the launcher can run without pnpm in
 * front of it. The script must `exec` node, for the reason `scripts/start.ts`
 * gives.
 */
const startScript = async (): Promise<readonly string[]> => {
  const manifest: unknown = JSON.parse(
    await readFile(join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  );
  const script =
    typeof manifest === 'object' &&
    manifest !== null &&
    'scripts' in manifest &&
    typeof manifest.scripts === 'object' &&
    manifest.scripts !== null &&
    'start' in manifest.scripts &&
    typeof manifest.scripts.start === 'string'
      ? manifest.scripts.start
      : '';
  const [exec, command, ...args] = script.split(' ');
  if (exec !== 'exec' || command !== 'node') {
    throw new Error(`Expected the start script to exec node: ${script}`);
  }
  return args;
};

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
  const root = await mkdtemp(join(tmpdir(), 'hyper-start-'));
  roots.push(root);
  const directory = join(root, 'talk');
  const port = await freePort();
  const runArguments = [directory, '--no-open', '--port', String(port)];
  const child =
    via === 'pnpm'
      ? spawn('pnpm', ['--silent', 'start', ...runArguments], {
          cwd: REPOSITORY_ROOT,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn(process.execPath, [...(await startScript()), ...runArguments], {
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

  /** Rename the new Space over HTTP, exactly as the browser commits. */
  const rename = async (title: string): Promise<void> => {
    const backend = new HttpSpaceBackend(`http://localhost:${String(port)}`);
    const loaded = await backend.loadSpace(metaSpaceId);
    if (loaded === undefined) throw new Error('Expected the new Space');
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

describe('pnpm start', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'serves a new directory, writes an edit and exits zero on %s',
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
