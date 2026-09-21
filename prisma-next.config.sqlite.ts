import { defineConfig } from '@prisma-next/sqlite/config';
import { sqliteMigrationComposition } from './src/sqlite/composition';

/*
 * Migration resolves `SQLITE_PATH` through the one SQLite policy rather than
 * reading the variable raw (ticket 26): a path must be absolute and have a
 * writable parent, and one that is not is refused here rather than part-way
 * through a migration. Planning offline is still done with no path at all —
 * an unset or blank `SQLITE_PATH` omits the `db` binding below
 * (`test/unit/prisma-sqlite-foundation.test.ts`).
 */
const sqlitePath = sqliteMigrationComposition().path;

const config: Parameters<typeof defineConfig>[0] = sqlitePath
  ? {
      contract: './src/sqlite/contract.prisma',
      db: { connection: sqlitePath },
      migrations: { dir: './migrations-sqlite' },
    }
  : {
      contract: './src/sqlite/contract.prisma',
      migrations: { dir: './migrations-sqlite' },
    };

export default defineConfig(config);
