import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { fastPathRaces } from '../support/fast-path-races';
import { openSqliteRepository } from '../support/sqlite-harness';

/*
 * The SQLite half of the fast-path races (`test/support/fast-path-races.ts`).
 * The store queues every operation on a file handle, so the second operation
 * of each race waits in that queue.
 */
fastPathRaces('commit fast path races (SQLite)', async () => {
  const harness = await openSqliteRepository();
  return {
    store: sqliteSqlStore(harness.database),
    runsCommitsConcurrently: false,
    close: harness.close,
  };
});
