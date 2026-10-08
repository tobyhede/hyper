import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { RunCommand } from './arguments';

/**
 * `hyper run <dir>`: run an Aggregate directory (ADR 0117).
 *
 * The run itself is `run-process.ts`, started here in a process group of its
 * own, so a terminal's signal reaches it only as this launcher forwards it:
 * the run's first signal stops it and its second exits at once, which is only
 * right if each signal it receives is one the author sent.
 *
 * The `hyper` script `exec`s node, so this launcher is the process pnpm runs
 * and signals whichever `sh` pnpm uses. A shell that forks its last command
 * instead sits between pnpm and the launcher and dies of the SIGTERM pnpm
 * sends it; pnpm then raises that signal on itself and exits before the run
 * has written its last edit. `test/integration/run-command.test.ts` refuses a
 * `hyper` script that does not `exec`.
 */

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const RUN = fileURLToPath(new URL('./run-process.ts', import.meta.url));

/**
 * One Ctrl-C reaches this launcher twice under `pnpm hyper run`: once from the
 * terminal, which signals its whole foreground group, and once from pnpm,
 * which forwards the signal to the script it runs. A signal carries nothing
 * that tells its sender here, so a repeat of the same signal within this long
 * is taken as that one delivery. pnpm forwards a second Ctrl-C as SIGTERM,
 * which is a different signal and is never dropped, so a second keypress under
 * pnpm forces exit however soon it follows. `test/integration/run-command
 * .test.ts` signals the whole group, as a terminal does, for both cases.
 */
const REPEATED_SIGNAL_MILLISECONDS = 250;

/** The run process's command line, which it parses as `hyper` parses its own. */
const runArguments = ({ directory, port, open }: RunCommand): readonly string[] => {
  const args = ['run', directory];
  if (port !== undefined) args.push('--port', String(port));
  if (!open) args.push('--no-open');
  return args;
};

/** Start the run and forward it the author's signals, answering its exit code. */
export const launchRun = (command: RunCommand): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, RUN, ...runArguments(command)], {
      detached: true,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    const forwardedAt = new Map<NodeJS.Signals, number>();
    for (const signal of SIGNALS) {
      process.on(signal, () => {
        const now = Date.now();
        const previous = forwardedAt.get(signal);
        if (previous !== undefined && now - previous < REPEATED_SIGNAL_MILLISECONDS) return;
        forwardedAt.set(signal, now);
        child.kill(signal);
      });
    }
    child.once('error', (error) => {
      process.stderr.write(`Could not start the run: ${error.message}\n`);
      resolve(1);
    });
    child.once('exit', (code) => {
      resolve(code ?? 1);
    });
  });
