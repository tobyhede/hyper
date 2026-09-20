import type { SqlTables } from '../persistence/sql-store';
import {
  asOrderable,
  createRepositoryState,
  createSpaceRow,
  createThingRow,
  defineSqlStore,
  deleteRepositoryState,
  deleteSpaceById,
  deleteThingsForSpace,
  listSpaceIds,
  loadAllForReplacement,
  type Orderable,
  readRepositoryState,
  relockRepositoryState,
  relockSpace,
  setExportedRevision,
  setSpaceRevision,
  upsertThingRow,
  writeDocumentUnderLock,
} from '../persistence/sql-store';
import { db } from './db';

type Orm = typeof db.orm.public;

/**
 * `Order`, named once from a real, harmless reference to the live `orm` —
 * `asOrderable`'s call infers it, and this pulls it back out of the concrete
 * (if unwieldy) instantiation so `tables()` below can name it as an ordinary
 * return-type annotation. The binding itself is never read at runtime, only
 * through `typeof` below, hence the `_` — TypeScript's own convention for
 * "used as a type, not a value".
 */
const _orderProbe = asOrderable(db.orm.public.Space);
type InferredOrder = typeof _orderProbe extends Orderable<infer O> ? O : never;

interface SqlPrimaryKeyConflictFields {
  readonly kind?: unknown;
  readonly sqlState?: unknown;
  readonly table?: unknown;
  readonly constraint?: unknown;
}

/**
 * PostgreSQL's own answer to a losing insert: SQLSTATE 23505 naming the
 * table and its `<table>_pkey` primary-key constraint — every table here
 * follows Prisma Next's default constraint-naming convention
 * (`src/prisma/contract.prisma` names no primary key explicitly).
 */
const isPrimaryKeyConflict = (error: unknown, table: string): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  // SAFETY: checked above — error is a non-null object, so probing named
  // fields on it (each still typed unknown until compared) cannot throw.
  const candidate = error as SqlPrimaryKeyConflictFields;
  return (
    candidate.kind === 'sql_query' &&
    candidate.sqlState === '23505' &&
    candidate.table === table &&
    candidate.constraint === `${table}_pkey`
  );
};

/**
 * `Space.where({ id }).include('things', …).first()`, composed once here
 * rather than by the shared repository (`SqlTables`'s doc comment explains
 * why `.include(...)` cannot cross that boundary generically). `document` is
 * left `unknown` for the shared repository's schema to parse — PostgreSQL's
 * own `jsonb` codec has already decoded it into a plain value by the time it
 * reaches here, so no further decoding happens in this function.
 */
const loadWithThings = (orm: Orm, id: string) =>
  orm.Space.where({ id })
    .include('things', (things) =>
      things.select('id', 'document').orderBy((thing) => thing.id.asc()),
    )
    .first();

/**
 * Every stored Space with its Things, ascending by id. PostgreSQL's `jsonb`
 * column refuses non-JSON text before it is ever stored, so — unlike
 * SQLite's — this reads through the ordinary ORM exactly as `loadWithThings`
 * above does; nothing here needs the lower-level `sql`/`execute` treatment
 * `SqlTables`'s doc comment describes for the other database.
 */
const loadEvery = (orm: Orm) =>
  orm.Space.orderBy((space) => space.id.asc())
    .include('things', (things) =>
      things.select('id', 'document').orderBy((thing) => thing.id.asc()),
    )
    .all();

/** `SqlTables.Thing.deleteExcept`'s own doc comment explains why `keepIds` may be empty. */
const deleteThingsExcept = async (
  orm: Orm,
  spaceId: string,
  keepIds: readonly string[],
): Promise<void> => {
  const owned = orm.Thing.where({ spaceId });
  if (keepIds.length === 0) {
    await owned.deleteCount();
    return;
  }
  await owned.where((thing) => thing.id.notIn(keepIds)).deleteCount();
};

/** PostgreSQL's `SqlStore`: `document` already decoded by the `jsonb` codec, never re-parsed here. */
export const postgresSqlStore = defineSqlStore({
  orm: db.orm.public,
  tables(orm: Orm): SqlTables<InferredOrder> {
    return {
      Space: {
        orderBy: (build) => orm.Space.orderBy(build),
        loadWithThings: (id: string) => loadWithThings(orm, id),
        loadEvery: () => loadEvery(orm),
        loadAllForReplacement: () => loadAllForReplacement(orm.Space),
        relock: (id: string) => relockSpace(orm.Space, id),
        create: (input) => createSpaceRow(orm.Space, input),
        listIds: () => listSpaceIds(orm.Space),
        deleteById: (id: string) => deleteSpaceById(orm.Space, id),
        setExportedRevision: (id: string, revision: string) =>
          setExportedRevision(orm.Space, id, revision),
        writeDocumentUnderLock: (id: string, document: unknown) =>
          writeDocumentUnderLock(orm.Space, id, document),
        setRevision: (id: string, revision: string) => setSpaceRevision(orm.Space, id, revision),
      },
      Thing: {
        create: (input) => createThingRow(orm.Thing, input),
        upsert: (input) => upsertThingRow(orm.Thing, input),
        deleteExcept: (spaceId: string, keepIds: readonly string[]) =>
          deleteThingsExcept(orm, spaceId, keepIds),
        deleteAllForSpace: (spaceId: string) => deleteThingsForSpace(orm.Thing, spaceId),
      },
      RepositoryState: {
        read: () => readRepositoryState(orm.RepositoryState),
        relock: (metaSpaceId: string) => relockRepositoryState(orm.RepositoryState, metaSpaceId),
        create: (metaSpaceId: string) => createRepositoryState(orm.RepositoryState, metaSpaceId),
        delete: () => deleteRepositoryState(orm.RepositoryState),
      },
    };
  },
  transaction<T>(fn: (orm: Orm) => Promise<T>): Promise<T> {
    return db.transaction(({ orm }) => fn(orm.public));
  },
  readDocument(value: unknown): unknown {
    return value;
  },
  isDuplicateKey(error: unknown, table: string): boolean {
    return isPrimaryKeyConflict(error, table);
  },
  serialise<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  },
  close(): Promise<void> {
    return db.close();
  },
});
