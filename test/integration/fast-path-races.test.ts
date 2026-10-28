import { afterAll } from 'vitest';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { clearInfinityCubeContent } from '../support/clear-infinity-cube-content';
import { fastPathRaces } from '../support/fast-path-races';
import { postgresTestDatabase } from '../support/postgres-database';

/*
 * The PostgreSQL half of the fast-path races (`test/support/fast-path-races.ts`).
 * Commits run on separate pooled connections, so the second operation of each
 * race waits on the aggregate lock the first holds.
 */
fastPathRaces('commit fast path races (PostgreSQL)', async () => {
  await clearInfinityCubeContent();
  return {
    store: postgresSqlStore(postgresTestDatabase),
    runsCommitsConcurrently: true,
    close: clearInfinityCubeContent,
  };
});

afterAll(async () => {
  await clearInfinityCubeContent();
  await postgresTestDatabase.close();
});
