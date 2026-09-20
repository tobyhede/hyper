import type { SqlTables } from '../persistence/sql-store';
import {
  asOrderable,
  buildRepositoryStateTable,
  buildSpaceTable,
  buildResourceTable,
  defineSqlStore,
  type Orderable,
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
 * `Space.where({ id }).include('resources', …).first()`, composed once here
 * rather than by the shared repository (`SqlTables`'s doc comment explains
 * why `.include(...)` cannot cross that boundary generically). `document` is
 * left `unknown` for the shared repository's schema to parse — PostgreSQL's
 * own `jsonb` codec has already decoded it into a plain value by the time it
 * reaches here, so no further decoding happens in this function.
 */
const loadWithResources = (orm: Orm, id: string) =>
  orm.Space.where({ id })
    .include('resources', (resources) =>
      resources.select('id', 'document').orderBy((resource) => resource.id.asc()),
    )
    .first();

/**
 * Every stored Space with its Resources, ascending by id. PostgreSQL's `jsonb`
 * column refuses non-JSON text before it is ever stored, so — unlike
 * SQLite's — this reads through the ordinary ORM exactly as `loadWithResources`
 * above does; nothing here needs the lower-level `sql`/`execute` treatment
 * `SqlTables`'s doc comment describes for the other database.
 */
const loadEvery = (orm: Orm) =>
  orm.Space.orderBy((space) => space.id.asc())
    .include('resources', (resources) =>
      resources.select('id', 'document').orderBy((resource) => resource.id.asc()),
    )
    .all();

/** `SqlTables.Resource.deleteExcept`'s own doc comment explains why `keepIds` may be empty. */
const deleteResourcesExcept = async (
  orm: Orm,
  spaceId: string,
  keepIds: readonly string[],
): Promise<void> => {
  const owned = orm.Resource.where({ spaceId });
  if (keepIds.length === 0) {
    await owned.deleteCount();
    return;
  }
  await owned.where((resource) => resource.id.notIn(keepIds)).deleteCount();
};

/** PostgreSQL's `SqlStore`: `document` already decoded by the `jsonb` codec, never re-parsed here. */
export const postgresSqlStore = defineSqlStore({
  orm: db.orm.public,
  tables(orm: Orm): SqlTables<InferredOrder> {
    return {
      Space: buildSpaceTable(
        orm.Space,
        (id: string) => loadWithResources(orm, id),
        () => loadEvery(orm),
      ),
      Resource: buildResourceTable(orm.Resource, (spaceId: string, keepIds: readonly string[]) =>
        deleteResourcesExcept(orm, spaceId, keepIds),
      ),
      RepositoryState: buildRepositoryStateTable(orm.RepositoryState),
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
