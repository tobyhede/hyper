import type { SqliteDatabase } from '../../src/sqlite/db';

/**
 * Delete every Hyper row from a SQLite database file, mirroring
 * `clear-hyper-content.ts` for PostgreSQL. SQLite has no schema namespace, so
 * this reads `orm.Space`/`orm.Thing`/`orm.RepositoryState` directly rather
 * than through a `.public` prefix.
 */
export const clearSqliteContent = async (database: SqliteDatabase): Promise<void> => {
  await database.orm.RepositoryState.where({ singletonId: 1 }).delete();
  // Ids and counts, never a whole row, for the reason `#truncateHyperContent` in
  // `src/persistence/sql-space-repository.ts` reads that way: a row read or
  // returned whole goes through the json codec, which throws on a `document`
  // that is not JSON — and a file left holding one is exactly what this is for.
  for (const space of await database.orm.Space.select('id').all()) {
    await database.orm.Thing.where({ spaceId: space.id }).deleteCount();
    await database.orm.Space.where({ id: space.id }).deleteCount();
  }
};
