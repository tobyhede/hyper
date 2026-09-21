import { afterAll, describe, it } from 'vitest';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { postgresSqlStore } from '../../src/prisma/sql-store';
import { postgresTestDatabase } from '../support/postgres-database';
import { clearHyperContent } from '../support/clear-hyper-content';
import { assertDifferential } from '../support/aggregate-commit-differential';

/*
 * The PostgreSQL half of the aggregate-commit differential. The property
 * body itself, and what it proves, are documented once in
 * `test/support/aggregate-commit-differential.ts` — this file supplies only
 * the PostgreSQL `SqlSpaceRepository` and how to clear it between runs.
 * `test/integration/sqlite-aggregate-commit-differential.test.ts` is the
 * SQLite half, split into its own `sqlite-*`-named file so
 * `vitest.sqlite.config.ts` (and so CI's `sqlite` job) actually runs it —
 * `vitest.integration.config.ts` excludes `sqlite-*.test.ts`, and this file's
 * own name never matched that pattern, so it stays covered by
 * `pnpm test:integration:postgres` unchanged.
 */
describe('aggregate commit adapter differential', () => {
  it('gives memory and PostgreSQL the same public outcome over generated aggregate changes', async () => {
    await assertDifferential({
      repository: new SqlSpaceRepository(postgresSqlStore(postgresTestDatabase)),
      clear: clearHyperContent,
    });
  });

  afterAll(async () => {
    await clearHyperContent();
    await postgresTestDatabase.close();
  });
});
