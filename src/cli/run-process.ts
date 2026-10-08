import { newUuid } from '@project/core';
import { createServer } from 'vite';
import { runViteConfig } from '../../packages/app/database-vite-config';
import { startRun, type RunEvent } from '../run/run';
import { USAGE, parseHyperArguments } from './arguments';
import { cliArguments } from './process';
import { shellWord } from './shell-word';

/**
 * The process behind `hyper run <dir>` that runs an Aggregate directory
 * (ADR 0117). `run-launcher.ts` starts it in a process group of its own,
 * with the directory already resolved, and forwards it the signals the
 * terminal sends.
 *
 * The composition root for a run. It names the process's clock, identity
 * source, streams and signals, and hands the first two to the Run module;
 * everything about when the directory is written is the Run module's.
 */

const DEFAULT_PORT = 4173;
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

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

const command = parseHyperArguments(cliArguments());
if (command?.verb !== 'run') {
  process.stderr.write(USAGE);
  process.exit(2);
}
const parsed = {
  directory: command.directory,
  port: command.port ?? DEFAULT_PORT,
  // An explicit `--port` is the author's choice, so it is not moved to the next free one.
  strictPort: command.port !== undefined,
  open: command.open,
};

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

if (started.kind === 'empty') {
  process.stderr.write(
    `${parsed.directory} holds no aggregate: it is missing or empty. To create one there: pnpm hyper init ${shellWord(parsed.directory)}\n`,
  );
  process.exit(1);
}
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
// `test/integration/run-command.test.ts` exits 143 with the edit unwritten.
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
const url = server.resolvedUrls?.local[0] ?? `http://localhost:${String(parsed.port)}/`;
process.stdout.write(`Running ${parsed.directory} at ${url}\nPress Ctrl-C to stop.\n`);
if (parsed.open) server.openBrowser();
