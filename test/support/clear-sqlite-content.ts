import type { SqliteDatabase } from '../../src/sqlite/db';

/**
 * Delete every Hyper row from a SQLite database file, mirroring
 * `clear-hyper-content.ts` for PostgreSQL. SQLite has no schema namespace, so
 * this reads `orm.Space`/`orm.Thing`/`orm.RepositoryState` directly rather
 * than through a `.public` prefix.
 */
export const clearSqliteContent = async (database: SqliteDatabase): Promise<void> => {
  await database.orm.RepositoryState.where({ singletonId: 1 }).delete();
  for (const space of await database.orm.Space.all()) {
    await database.orm.Thing.where({ spaceId: space.id }).deleteAll();
    await database.orm.Space.where({ id: space.id }).delete();
  }
};
