import { spawn } from 'node:child_process';

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly timeoutLabel?: string;
}

const CLI_PROCESS_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_LABEL = 'command';

/**
 * Run one command, capturing stdout/stderr and enforcing a timeout.
 *
 * Exported so a test can inject a short-lived, deterministic reproduction
 * (`test/unit/hyper-command.test.ts`) without spawning a real `hyper` CLI.
 * `runHyperScript` below is the one production caller.
 *
 * `detached: true` makes the spawned process the leader of its own POSIX
 * process group rather than joining ours, so a grandchild it starts without
 * changing its own group — a shell backgrounding a job, for instance —
 * inherits that group. On timeout we signal the whole group
 * (`process.kill(-pid, 'SIGKILL')`), not just the direct child: killing only
 * the direct child can leave such a grandchild alive holding the
 * stdout/stderr pipes open, and `close` never fires while any process still
 * holds a write end open. We also settle on the direct child's own `exit`
 * once we know we have timed out, rather than only on `close`, so a
 * still-open stream elsewhere cannot keep the promise pending after we have
 * already given up on the command.
 */
export const runCommand = (
  command: string,
  args: readonly string[],
  options: RunCommandOptions = {},
): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? CLI_PROCESS_TIMEOUT_MS;
    const timeoutLabel = options.timeoutLabel ?? DEFAULT_TIMEOUT_LABEL;
    const child = spawn(command, [...args], {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let settled = false;
    const settle = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout.removeListener('data', captureStdout);
      child.stderr.removeListener('data', captureStderr);
      child.removeListener('error', handleError);
      child.removeListener('close', handleClose);
      child.removeListener('exit', handleTimedOutExit);
      complete();
    };
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutError = new Error(`${timeoutLabel} timed out after ${timeoutMs}ms`);
    const captureStdout = (chunk: string): void => {
      stdout += chunk;
    };
    const captureStderr = (chunk: string): void => {
      stderr += chunk;
    };
    const handleError = (error: Error): void => {
      settle(() => reject(timedOut ? timeoutError : error));
    };
    const handleClose = (status: number | null): void => {
      settle(() => {
        if (timedOut) reject(timeoutError);
        else resolve({ status, stdout, stderr });
      });
    };
    const handleTimedOutExit = (): void => {
      if (!timedOut) return;
      settle(() => reject(timeoutError));
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', captureStdout);
    child.stderr.on('data', captureStderr);
    child.once('error', handleError);
    child.once('close', handleClose);
    child.once('exit', handleTimedOutExit);
    const timeout = setTimeout(() => {
      timedOut = true;
      const pid = child.pid;
      if (pid === undefined) return;
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // The group is already gone, or never formed; fall back to the
        // direct child so a still-running process is not left untouched.
        child.kill('SIGKILL');
      }
    }, timeoutMs);
  });

/**
 * Run one `hyper` package script as its own process, as an operator would.
 *
 * `script` is the target: `hyper` is PostgreSQL and `hyper:sqlite` is SQLite.
 * `env` is added to this process's environment, which is how a SQLite case
 * names the file it owns.
 */
export const runHyperScript = (
  script: 'hyper' | 'hyper:sqlite',
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): Promise<CommandResult> =>
  runCommand('pnpm', ['--silent', script, '--', ...args], {
    env,
    timeoutLabel: 'hyper CLI command',
  });
