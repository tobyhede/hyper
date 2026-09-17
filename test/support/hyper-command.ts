import { spawn } from 'node:child_process';

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const CLI_PROCESS_TIMEOUT_MS = 10_000;

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
  new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['--silent', script, '--', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
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
      complete();
    };
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutError = new Error(`hyper CLI command timed out after ${CLI_PROCESS_TIMEOUT_MS}ms`);
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
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', captureStdout);
    child.stderr.on('data', captureStderr);
    child.once('error', handleError);
    child.once('close', handleClose);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, CLI_PROCESS_TIMEOUT_MS);
  });
