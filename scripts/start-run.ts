import { resolve } from 'node:path';
import { newUuid } from '@project/core';
import { createServer } from 'vite';
import { runViteConfig } from '../packages/app/database-vite-config';
import { startRun, type RunEvent } from '../src/run/run';

/**
 * The process behind `pnpm start <dir>` that runs an Aggregate directory
 * (ADR 0117). `scripts/start.ts` starts it in a process group of its own and
 * forwards it the signals the terminal sends.
 *
 * The composition root for a run. It names the process's clock, identity
 * source, streams, signals and working directory, and hands the first two to
 * the Run module; everything about when the directory is written is the Run
 * module's.
 */

const USAGE = 'Usage: pnpm start <aggregate-directory> [--port <port>] [--no-open]\n';
const DEFAULT_PORT = 4173;
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

interface StartArguments {
  readonly directory: string;
  readonly port: number;
  /** An explicit `--port` is the author's choice, so it is not moved to the next free one. */
  readonly strictPort: boolean;
  readonly open: boolean;
}

const parsePort = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const port = Number(value);
  return port > 0 && port < 65_536 ? port : undefined;
};

const parseArguments = (args: readonly string[]): StartArguments | undefined => {
  const paths: string[] = [];
  let port: number | undefined;
  let open = true;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? '';
    if (argument === '--no-open') {
      open = false;
    } else if (argument === '--port') {
      if (port !== undefined) return undefined;
      index += 1;
      port = parsePort(args[index]);
      if (port === undefined) return undefined;
    } else if (argument.startsWith('-') || argument === '') {
      return undefined;
    } else {
      paths.push(argument);
    }
  }
  const [path, ...rest] = paths;
  if (path === undefined || rest.length > 0) return undefined;
  // pnpm runs a script from the repository root and records where it was
  // invoked in `INIT_CWD`, which is what a relative directory is relative to.
  const directory = resolve(process.env['INIT_CWD'] ?? process.cwd(), path);
  return { directory, port: port ?? DEFAULT_PORT, strictPort: port !== undefined, open };
};

const describe = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

const report = (event: RunEvent): void => {
  if (event.kind === 'write-failed') {
    process.stderr.write(`Could not write the directory: ${describe(event.reason)}\n`);
  }
};

// A closed terminal or reader makes a write here fail with EPIPE or EIO, and
// an unhandled stream error would end the process before the stop's last
// write lands. What the run prints is a courtesy; the directory is the record.
for (const stream of [process.stdout, process.stderr]) stream.on('error', () => undefined);

const processArgs = process.argv.slice(2);
const parsed = parseArguments(processArgs[0] === '--' ? processArgs.slice(1) : processArgs);
if (parsed === undefined) {
  process.stderr.write(USAGE);
  process.exit(2);
}

const started = await startRun(parsed.directory, {
  newId: newUuid,
  schedule: (callback, milliseconds) => {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
  report,
}).catch((error: unknown) => {
  process.stderr.write(`Could not start a run on ${parsed.directory}: ${describe(error)}\n`);
  process.exit(1);
});

if (started.kind === 'unreadable') {
  process.stderr.write(
    `${parsed.directory} is not an Aggregate directory:\n${started.diagnostics.join('\n')}\n`,
  );
  process.exit(1);
}
if (started.kind === 'aggregate-refused') {
  process.stderr.write(`Aggregate validation failed:\n${started.diagnostics.join('\n')}\n`);
  process.exit(1);
}
const { run } = started;

const server = await createServer({
  ...runViteConfig(run.host),
  server: { port: parsed.port, strictPort: parsed.strictPort },
});

// Vite's server listens for SIGTERM, and outside CI for standard input ending,
// and answers either by closing the server and exiting the process — before
// the run has written its last edit. This process owns its signals and its
// exit, so those listeners go; without this, the SIGTERM case in
// `test/integration/start-command.test.ts` exits 143 with the edit unwritten.
process.removeAllListeners('SIGTERM');
process.stdin.removeAllListeners('end');

let stopping = false;
const stop = async (): Promise<void> => {
  // The server closes first, so no edit can be committed behind the last write.
  // Its failing to close is no reason to skip the write.
  await server.close().catch((error: unknown) => {
    process.stderr.write(`Could not close the server: ${describe(error)}\n`);
  });
  const stopped = await run.stop();
  if (stopped.kind === 'unwritten') {
    process.stderr.write(
      `Stopped, but the last edits were not written: ${describe(stopped.reason)}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`Stopped; ${parsed.directory} holds every edit.\n`);
  process.exit(0);
};
const beginStopping = (): void => {
  stopping = true;
  process.stdout.write('Stopping: writing any edit not yet on disk…\n');
  stop().catch((error: unknown) => {
    process.stderr.write(`Could not stop cleanly: ${describe(error)}\n`);
    process.exit(1);
  });
};
// The first signal stops the run; any signal after it exits at once. The
// launcher forwards each stop and each force once, so every signal here is one
// the author sent.
for (const signal of SIGNALS) {
  process.on(signal, () => {
    if (!stopping) {
      beginStopping();
      return;
    }
    process.stderr.write('Exiting without waiting for the last write.\n');
    process.exit(1);
  });
}
// The launcher holds an IPC channel open for as long as it lives. Losing it
// means the launcher died without forwarding a signal, and this process, in a
// group of its own, would otherwise serve on with nothing in front of it.
process.once('disconnect', () => {
  if (!stopping) beginStopping();
});

await server.listen();
if (run.established) process.stdout.write(`Created a new Space in ${parsed.directory}\n`);
const url = server.resolvedUrls?.local[0] ?? `http://localhost:${String(parsed.port)}/`;
process.stdout.write(`Running ${parsed.directory} at ${url}\nPress Ctrl-C to stop.\n`);
if (parsed.open) server.openBrowser();
