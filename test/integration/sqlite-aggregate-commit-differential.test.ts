import { describe, it } from 'vitest';
import { SqlSpaceRepository } from '../../src/persistence/sql-space-repository';
import { sqliteSqlStore } from '../../src/sqlite/sql-store';
import { clearSqliteContent } from '../support/clear-sqlite-content';
import { openSqliteRepository } from '../support/sqlite-harness';
import { assertDifferential } from '../support/aggregate-commit-differential';

/*
 * The SQLite half of the aggregate-commit differential. The property body
 * itself, and what it proves, are documented once in
 * `test/support/aggregate-commit-differential.ts` — this file supplies only
 * the SQLite `SqlSpaceRepository` and how to clear it between runs.
 * `test/integration/aggregate-commit-differential.test.ts` is the PostgreSQL
 * half. This file is named `sqlite-*`, the convention
 * `sqlite-space-repository.test.ts` and `sqlite-hyper-cli.test.ts` already
 * follow, so `vitest.sqlite.config.ts`'s `include` picks it up and
 * `pnpm test:integration:sqlite` — and so CI's `sqlite` job, which has no
 * `DATABASE_URL` and no PostgreSQL service — actually runs it;
 * `vitest.integration.config.ts` excludes `sqlite-*.test.ts`, so the two
 * commands still run exactly one half each.
 */
describe('aggregate commit adapter differential', () => {
  it('gives memory and SQLite the same public outcome over generated aggregate changes', async () => {
    const harness = await openSqliteRepository();
    try {
      await assertDifferential({
        repository: new SqlSpaceRepository(sqliteSqlStore(harness.database)),
        clear: () => clearSqliteContent(harness.database),
      });
    } finally {
      await harness.close();
    }
  });
});
