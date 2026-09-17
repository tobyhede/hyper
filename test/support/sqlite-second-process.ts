import { spawn } from 'node:child_process';

/**
 * The lock a second process takes on a live SQLite file and holds, without
 * writing, until it is released.
 *
 * `shared` is what a reader holds part-way through a transaction (`BEGIN` plus
 * a read), `reserved` what a writer holds before it commits (`BEGIN IMMEDIATE`),
 * and `exclusive` what a writer holds while it commits (`BEGIN EXCLUSIVE`).
 */
export type SecondProcessLock = 'shared' | 'reserved' | 'exclusive';

export interface HeldLock {
  /** Roll the second process's transaction back and wait for the process to exit. */
  release(): Promise<void>;
}

// Plain JavaScript on `node:sqlite` so the holder is a second OS process with
// its own handle and its own event loop, and nothing it runs is Hyper's.
const HOLDER = `
const { DatabaseSync } = require('node:sqlite');
const [path, lock, releaseAfter] = process.argv.slice(1);
const db = new DatabaseSync(path, { timeout: 0 });
db.exec(lock === 'shared' ? 'BEGIN' : lock === 'reserved' ? 'BEGIN IMMEDIATE' : 'BEGIN EXCLUSIVE');
db.prepare('SELECT count(*) FROM spaces').get();
let released = false;
const release = () => {
  if (released) return;
  released = true;
  db.exec('ROLLBACK');
  db.close();
  process.exit(0);
};
process.stdin.on('data', release);
process.stdin.on('end', release);
if (releaseAfter !== 'never') setTimeout(release, Number(releaseAfter));
process.stdout.write('held\\n');
`;

const HOLDER_START_TIMEOUT_MS = 10_000;

/**
 * Start a second process holding `lock` on the file at `path`, resolving once
 * it holds it.
 *
 * With `releaseAfterMs` the second process lets go on its own clock, which is
 * the only way to release while this process is inside SQLite's synchronous
 * busy wait. Without it, the lock is held until `release()`.
 */
export const holdLockInSecondProcess = (
  path: string,
  lock: SecondProcessLock,
  releaseAfterMs?: number,
): Promise<HeldLock> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['-e', HOLDER, path, lock, releaseAfterMs === undefined ? 'never' : String(releaseAfterMs)],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const exited = new Promise<void>((settle) => child.once('exit', () => settle()));
    // A holder that released on its own clock has closed its end of the pipe.
    child.stdin.on('error', () => undefined);
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Second process did not take a ${lock} lock\n${stderr}`));
    }, HOLDER_START_TIMEOUT_MS);
    child.once('exit', (status) => {
      clearTimeout(timeout);
      reject(new Error(`Second process exited (${status}) before holding a lock\n${stderr}`));
    });
    child.stdout.setEncoding('utf8');
    child.stdout.once('data', () => {
      clearTimeout(timeout);
      resolve({
        release: async () => {
          if (child.exitCode === null && child.stdin.writable) child.stdin.end('release\n');
          await exited;
        },
      });
    });
  });

/**
 * Whether a failure is SQLite refusing a lock, anywhere on the cause chain the
 * runtime wraps a failed COMMIT in.
 *
 * The driver's own classification rather than SQLite's error codes: a transient
 * `SqlConnectionError` is what it makes of `SQLITE_BUSY` and `SQLITE_LOCKED`,
 * extended codes included, and of nothing else (`@prisma-next/driver-sqlite`'s
 * `normalize-error.ts`, which marks every other connection failure
 * non-transient).
 */
export const isBusyOrLocked = (cause: unknown): boolean => {
  const seen = new Set<unknown>();
  let current = cause;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (
      'kind' in current &&
      current.kind === 'sql_connection' &&
      'transient' in current &&
      current.transient === true
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
};
