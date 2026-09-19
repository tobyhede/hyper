import type { SqliteDatabase } from './db';

/**
 * One in-process queue per SQLite file handle, not per caller.
 *
 * The driver opens a new connection for every operation, so two operations
 * overlapping on one `SqliteDatabase` are two SQLite connections that
 * genuinely contend — a deferred `BEGIN` waiting on another, or an
 * auto-commit read holding its statement open across a promise turn making an
 * overlapping commit's `COMMIT` wait out the busy timeout synchronously and
 * fail. Keyed by the `SqliteDatabase` value itself (a `WeakMap`, so a closed
 * and discarded handle's queue is collected with it) rather than held on a
 * repository instance, because ADR 0095 has the queue order every repository
 * operation reached through that handle — two repositories built over one
 * file (the HTTP runtime and `test/support/sqlite-harness.ts` each do this)
 * have to share it, proven by
 * `test/integration/sqlite-space-repository.test.ts`'s "serialises
 * overlapping operations across two repositories over one file handle".
 */
const queues = new WeakMap<SqliteDatabase, Promise<void>>();

export const serialiseSqlite = <T>(
  database: SqliteDatabase,
  operation: () => Promise<T>,
): Promise<T> => {
  const queue = queues.get(database) ?? Promise.resolve();
  const run = queue.then(operation, operation);
  queues.set(
    database,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
};
