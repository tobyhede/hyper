import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RunEvent, RunStart } from '../run/run';
import type { RunCommand } from './arguments';
import { describeError } from './describe-error';
import { RUN_HANDLING_SIGNALS, RUN_SIGNALS, decodeRunCommand } from './run-launcher';
import { shellWord } from './shell-word';

/**
 * The process behind `hyper run <dir>` that runs an Aggregate directory
 * (ADR 0117). `run-launcher.ts` starts it in a process group of its own,
 * with the command already resolved, and forwards it the signals the
 * terminal sends.
 *
 * The composition root for a run. It names the process's clock, identity
 * source, streams and signals, and hands the first two to the Run module;
 * everything about when the directory is written is the Run module's.
 */

const DEFAULT_PORT = 4173;

/** Why a run did not start, as the sentence the author reads. */
export const describeRunRefusal = (
  refusal: Exclude<RunStart, { readonly kind: 'running' }>,
  directory: string,
): string => {
  switch (refusal.kind) {
    case 'empty':
      return `${directory} holds no aggregate: it is missing or empty. To create one there: pnpm hyper init ${shellWord(directory)}\n`;
    case 'unreadable':
      return `${directory} is not an Aggregate directory:\n${refusal.diagnostics.join('\n')}\n`;
    case 'aggregate-refused':
      return `Aggregate validation failed:\n${refusal.diagnostics.join('\n')}\n`;
  }
};

const report = (event: RunEvent): void => {
  if (event.kind === 'write-failed') {
    process.stderr.write(`Could not write the directory: ${describeError(event.reason)}\n`);
  }
};

interface RunLifecycle {
  stopping: boolean;
  /**
   * Set once the server may accept an edit. Before then no edit can have been
   * committed, so there is nothing to write and a stop exits at once.
   */
  stop: (() => Promise<void>) | undefined;
}

const serve = async ({ directory, port, open }: RunCommand): Promise<void> => {
  // An explicit `--port` is the author's choice, so it is not moved to the next free one.
  const serverOptions = { port: port ?? DEFAULT_PORT, strictPort: port !== undefined };

  const lifecycle: RunLifecycle = { stopping: false, stop: undefined };
  const beginStopping = (): void => {
    lifecycle.stopping = true;
    if (lifecycle.stop === undefined) {
      process.stdout.write(`Stopped before serving ${directory}.\n`);
      process.exit(0);
    }
    process.stdout.write('Stopping: writing any edit not yet on disk…\n');
    lifecycle.stop().catch((error: unknown) => {
      process.stderr.write(`Could not stop cleanly: ${describeError(error)}\n`);
      process.exit(1);
    });
  };
  // The first signal stops the run; any signal after it exits at once. The
  // launcher forwards each stop and each force once, so every signal here is one
  // the author sent.
  const onSignal = (): void => {
    if (!lifecycle.stopping) {
      beginStopping();
      return;
    }
    process.stderr.write('Exiting without waiting for the last write.\n');
    process.exit(1);
  };
  for (const signal of RUN_SIGNALS) process.on(signal, onSignal);
  // The launcher holds an IPC channel open for as long as it lives. Losing it
  // means the launcher died without forwarding a signal, and this process, in a
  // group of its own, would otherwise serve on with nothing in front of it.
  process.once('disconnect', () => {
    if (!lifecycle.stopping) beginStopping();
  });
  process.send?.(RUN_HANDLING_SIGNALS);

  const [{ newUuid }, { startRun }] = await Promise.all([
    import('@project/core'),
    import('../run/run'),
  ]);
  const started = await startRun(directory, {
    newId: newUuid,
    schedule: (callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    },
    report,
  }).catch((error: unknown) => {
    process.stderr.write(`Could not start a run on ${directory}: ${describeError(error)}\n`);
    process.exit(1);
  });
  if (started.kind !== 'running') {
    process.stderr.write(describeRunRefusal(started, directory));
    process.exit(1);
  }
  const { run } = started;

  const cannotServe = (error: unknown): never => {
    process.stderr.write(
      `Could not serve ${directory} on port ${String(serverOptions.port)}: ${describeError(error)}\n`,
    );
    process.exit(1);
  };
  const [{ createServer }, { runViteConfig }] = await Promise.all([
    import('vite'),
    import('../../packages/app/database-vite-config'),
  ]);
  // Vite's server listens for SIGTERM, and outside CI for standard input ending,
  // and answers either by closing the server and exiting the process — before
  // the run has written its last edit. This process owns its signals and its
  // exit, so those listeners go and its own SIGTERM listener is put back;
  // without this, the SIGTERM case in `test/integration/run-command.test.ts`
  // exits 143 with the edit unwritten.
  const server = await createServer({
    ...runViteConfig(run.host),
    server: serverOptions,
  }).catch(cannotServe);
  process.removeAllListeners('SIGTERM');
  process.on('SIGTERM', onSignal);
  process.stdin.removeAllListeners('end');

  lifecycle.stop = async () => {
    // The server closes first, so no edit can be committed behind the last write.
    // Its failing to close is no reason to skip the write.
    await server.close().catch((error: unknown) => {
      process.stderr.write(`Could not close the server: ${describeError(error)}\n`);
    });
    const stopped = await run.stop();
    if (stopped.kind === 'unwritten') {
      process.stderr.write(
        `Stopped, but the last edits were not written: ${describeError(stopped.reason)}\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`Stopped; ${directory} holds every edit.\n`);
    process.exit(0);
  };
  try {
    await server.listen();
  } catch (error) {
    await server.close().catch(() => undefined);
    cannotServe(error);
  }
  if (lifecycle.stopping) return;
  const url = server.resolvedUrls?.local[0] ?? `http://localhost:${String(serverOptions.port)}/`;
  process.stdout.write(`Running ${directory} at ${url}\nPress Ctrl-C to stop.\n`);
  if (open) server.openBrowser();
};

const entryPoint = process.argv[1];
if (entryPoint !== undefined && import.meta.url === pathToFileURL(resolve(entryPoint)).href) {
  // A closed terminal or reader makes a write here fail with EPIPE or EIO, and
  // an unhandled stream error would end the process before the stop's last
  // write lands. What the run prints is a courtesy; the directory is the record.
  for (const stream of [process.stdout, process.stderr]) stream.on('error', () => undefined);

  const command = decodeRunCommand(process.argv.slice(2));
  if (command === undefined) {
    process.stderr.write('The run process is started by `pnpm hyper run <dir>`.\n');
    process.exit(2);
  }
  await serve(command);
}
