import type { SqliteDatabase } from '../../src/sqlite/db';
import { clearSqlContent } from './clear-sql-content';

/**
 * Delete every InfinityCube row from a SQLite database file, mirroring
 * `clear-infinity-cube-content.ts` for PostgreSQL. SQLite has no schema namespace, so
 * this reads `orm.Space`/`orm.Resource`/`orm.RepositoryState` directly rather
 * than through a `.public` prefix.
 */
export const clearSqliteContent = async (database: SqliteDatabase): Promise<void> => {
  await clearSqlContent({
    deleteMetaIdentity: async () => {
      await database.orm.RepositoryState.where({ singletonId: 1 }).delete();
    },
    listSpaceIds: async () => database.orm.Space.select('id').all(),
    deleteResources: async (spaceId) =>
      database.orm.Resource.where({ spaceId })
        .deleteCount()
        .then(() => undefined),
    deleteSpace: async (spaceId) =>
      database.orm.Space.where({ id: spaceId })
        .deleteCount()
        .then(() => undefined),
    deleteImages: async () =>
      database.orm.Image.where((image) => image.id.isNotNull())
        .deleteCount()
        .then(() => undefined),
  });
};
