import type { DatabaseTarget } from '../database/database-target';
import { SqlSpaceRepository } from '../persistence/sql-space-repository';
import { createSqliteDatabase, type SqliteDatabase } from './db';
import { sqliteSqlStore } from './sql-store';

/**
 * The file this target opens, or the client a test opened for it.
 *
 * A path and nothing else: which path — and whether the file must already
 * exist — is the composition's question, answered once in
 * `src/sqlite/composition.ts`. A target that could resolve its own path would
 * be a second place that rule lives.
 */
export type SqliteTargetOptions =
  | { readonly path: string; readonly database?: undefined }
  | { readonly database: SqliteDatabase; readonly path?: undefined };

export const sqliteTarget = ({ database, path }: SqliteTargetOptions): DatabaseTarget => ({
  open() {
    const opened = database ?? createSqliteDatabase(path);
    const store = sqliteSqlStore(opened);
    return Promise.resolve({
      repository: new SqlSpaceRepository(store),
      close: () => store.close(),
    });
  },
});
