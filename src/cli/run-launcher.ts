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

/** The signals that stop a run, which the launcher forwards and the run process answers. */
export const RUN_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/**
 * The message the run process sends once it answers {@link RUN_SIGNALS}
 * itself. Until then a signal would end it by default, so the launcher holds
 * each signal and forwards it on this message.
 */
export const RUN_HANDLING_SIGNALS = 'handling-signals';

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

/** The resolved command as the run process's arguments, which {@link decodeRunCommand} reads. */
export const encodeRunCommand = ({ directory, port, open }: RunCommand): readonly string[] => [
  directory,
  port === undefined ? '' : String(port),
  open ? 'open' : 'no-open',
];

/** The command {@link encodeRunCommand} encoded, or `undefined` for anything else. */
export const decodeRunCommand = (args: readonly string[]): RunCommand | undefined => {
  const [directory, port, open, ...extra] = args;
  if (directory === undefined || port === undefined || extra.length > 0) return undefined;
  if (port !== '' && !/^\d+$/.test(port)) return undefined;
  if (open !== 'open' && open !== 'no-open') return undefined;
  return {
    verb: 'run',
    directory,
    port: port === '' ? undefined : Number(port),
    open: open === 'open',
  };
};

/**
 * The run process's own arguments, after node's: `run-process.ts` and the
 * encoded command. The process's command line ends with these, which is what
 * the `hyper-authoring` skill's check reads to find a run on a directory;
 * `test/unit/agent-skill-commands.test.ts`, "the hyper-authoring check that
 * nothing is serving the directory", runs that check against them.
 */
export const runProcessArguments = (command: RunCommand): readonly string[] => [
  RUN,
  ...encodeRunCommand(command),
];

/** Start the run and forward it the author's signals, answering its exit code. */
export const launchRun = (command: RunCommand): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [...process.execArgv, ...runProcessArguments(command)], {
      detached: true,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    let handling = false;
    const held: NodeJS.Signals[] = [];
    child.on('message', (message) => {
      if (message !== RUN_HANDLING_SIGNALS || handling) return;
      handling = true;
      for (const signal of held.splice(0)) child.kill(signal);
    });
    const forwardedAt = new Map<NodeJS.Signals, number>();
    for (const signal of RUN_SIGNALS) {
      process.on(signal, () => {
        const now = Date.now();
        const previous = forwardedAt.get(signal);
        if (previous !== undefined && now - previous < REPEATED_SIGNAL_MILLISECONDS) return;
        forwardedAt.set(signal, now);
        if (handling) child.kill(signal);
        else held.push(signal);
      });
    }
    child.once('error', (error) => {
      process.stderr.write(`Could not start the run: ${error.message}\n`);
      resolve(1);
    });
    child.once('exit', (code, signal) => {
      if (code === null) process.stderr.write(`The run ended on ${String(signal)}.\n`);
      resolve(code ?? 1);
    });
  });
