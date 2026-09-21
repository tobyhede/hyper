import type { DatabaseTarget } from '../database/database-target';
import { SqlSpaceRepository } from '../persistence/sql-space-repository';
import { createSqliteDatabase, sqliteCliPath, sqliteHostPath, type SqliteDatabase } from './db';
import { sqliteSqlStore } from './sql-store';

export interface SqliteTargetOptions {
  readonly database?: SqliteDatabase;
  readonly existing?: boolean;
  readonly path?: string;
}

export const sqliteTarget = ({
  database,
  existing = false,
  path,
}: SqliteTargetOptions = {}): DatabaseTarget => ({
  open() {
    const opened =
      database ?? createSqliteDatabase(path ?? (existing ? sqliteCliPath() : sqliteHostPath()));
    const store = sqliteSqlStore(opened);
    return Promise.resolve({
      repository: new SqlSpaceRepository(store),
      close: () => store.close(),
    });
  },
});
