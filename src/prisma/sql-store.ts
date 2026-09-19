import type { SqlSpaceListRow, SqlStore, SqlTables } from '../persistence/sql-store';
import { toJsonValue } from '../persistence/sql-store';
import { db } from './db';

type Orm = typeof db.orm.public;

/**
 * The one member `SqlTables`'s doc comment says crosses the module boundary
 * structurally: `Space.orderBy(...).all()`. Proves `orm.Space` is assignable
 * to this shape for some `Order`, and infers it — a generic identity
 * function rather than an assertion, so an accidental mismatch (a
 * misspelled column, a wrong revision type) fails to compile here instead of
 * being cast away.
 */
interface Orderable<Order> {
  readonly orderBy: (build: (space: { readonly id: { readonly asc: () => Order } }) => Order) => {
    readonly all: () => PromiseLike<readonly SqlSpaceListRow[]>;
  };
}

const asOrderable = <Order>(space: Orderable<Order>): Orderable<Order> => space;

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

/**
 * Same trick, over the whole `SqlStore` value: `Handle` is inferred from
 * what is passed rather than written out, so nothing here asserts a shape
 * the object literal does not actually have.
 */
const defineSqlStore = <Handle>(
  store: SqlStore<Handle, InferredOrder>,
): SqlStore<Handle, InferredOrder> => store;

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

/** `SqlTables.Space.loadAllForReplacement`'s own doc comment explains why `document` is never selected. */
const loadAllForReplacement = (orm: Orm) =>
  orm.Space.select('id', 'revision')
    .orderBy((space) => space.id.asc())
    .all();

/** `SqlTables.Space.relock`'s own doc comment explains the placeholder `document`. */
const relock = async (orm: Orm, id: string): Promise<string | undefined> => {
  const locked = await orm.Space.where({ id }).update({ document: toJsonValue({}) });
  return locked === null ? undefined : locked.revision;
};

const createSpace = async (
  orm: Orm,
  input: { readonly id: string; readonly document: unknown; readonly revision: string },
): Promise<void> => {
  await orm.Space.create({
    id: input.id,
    document: toJsonValue(input.document),
    revision: input.revision,
  });
};

const listSpaceIds = async (orm: Orm): Promise<readonly string[]> => {
  const rows = await orm.Space.select('id').all();
  return rows.map((row) => row.id);
};

/**
 * `deleteCount()` rather than `delete()`: the latter returns the deleted row,
 * decoded `document` included, and a truncation this answers for (ADR 0094)
 * deletes whatever is stored whether or not `document` parses -- so this must
 * never decode it, the same requirement `deleteExcept`/`deleteAllForSpace`
 * below carry for Things.
 */
const deleteSpaceById = async (orm: Orm, id: string): Promise<boolean> => {
  const deleted = await orm.Space.where({ id }).deleteCount();
  return deleted > 0;
};

const setExportedRevision = async (orm: Orm, id: string, revision: string): Promise<boolean> => {
  const updated = await orm.Space.where({ id }).update({ exportedRevision: revision });
  return updated !== null;
};

/** `SqlTables.Space.writeDocumentUnderLock`'s own doc comment explains the row lock. */
const writeDocumentUnderLock = async (
  orm: Orm,
  id: string,
  document: unknown,
): Promise<string | undefined> => {
  const locked = await orm.Space.where({ id }).update({ document: toJsonValue(document) });
  return locked === null ? undefined : locked.revision;
};

const setRevision = async (orm: Orm, id: string, revision: string): Promise<void> => {
  await orm.Space.where({ id }).update({ revision });
};

const createThing = async (
  orm: Orm,
  input: { readonly id: string; readonly spaceId: string; readonly document: unknown },
): Promise<void> => {
  await orm.Thing.create({
    id: input.id,
    spaceId: input.spaceId,
    document: toJsonValue(input.document),
  });
};

/** `SqlTables.Thing.upsert`'s own doc comment explains the ownership answer. */
const upsertThing = async (
  orm: Orm,
  input: { readonly id: string; readonly spaceId: string; readonly document: unknown },
): Promise<{ readonly spaceId: string }> => {
  const stored = await orm.Thing.upsert({
    create: { id: input.id, spaceId: input.spaceId, document: toJsonValue(input.document) },
    update: { document: toJsonValue(input.document) },
  });
  return { spaceId: stored.spaceId };
};

/**
 * `deleteCount()` rather than `deleteAll()`, for the same reason
 * `deleteSpaceById` above does: `#truncateHyperContent` calls this over
 * stored state it has not validated (ADR 0094), and `deleteAll()` returns the
 * deleted rows -- decoded `document` included -- which would decode exactly
 * the broken content truncation exists to remove without reading.
 */
const deleteThingsForSpace = async (orm: Orm, spaceId: string): Promise<void> => {
  await orm.Thing.where({ spaceId }).deleteCount();
};

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

const readRepositoryState = async (orm: Orm): Promise<{ readonly metaSpaceId: string } | null> => {
  const state = await orm.RepositoryState.where({ singletonId: 1 }).first();
  return state === null ? null : { metaSpaceId: state.metaSpaceId };
};

const relockRepositoryState = async (orm: Orm, metaSpaceId: string): Promise<boolean> => {
  const locked = await orm.RepositoryState.where({ singletonId: 1 }).update({ metaSpaceId });
  return locked !== null;
};

const createRepositoryState = async (orm: Orm, metaSpaceId: string): Promise<void> => {
  await orm.RepositoryState.create({ singletonId: 1, metaSpaceId });
};

const deleteRepositoryState = async (orm: Orm): Promise<void> => {
  await orm.RepositoryState.where({ singletonId: 1 }).delete();
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
        loadAllForReplacement: () => loadAllForReplacement(orm),
        relock: (id: string) => relock(orm, id),
        create: (input) => createSpace(orm, input),
        listIds: () => listSpaceIds(orm),
        deleteById: (id: string) => deleteSpaceById(orm, id),
        setExportedRevision: (id: string, revision: string) =>
          setExportedRevision(orm, id, revision),
        writeDocumentUnderLock: (id: string, document: unknown) =>
          writeDocumentUnderLock(orm, id, document),
        setRevision: (id: string, revision: string) => setRevision(orm, id, revision),
      },
      Thing: {
        create: (input) => createThing(orm, input),
        upsert: (input) => upsertThing(orm, input),
        deleteExcept: (spaceId: string, keepIds: readonly string[]) =>
          deleteThingsExcept(orm, spaceId, keepIds),
        deleteAllForSpace: (spaceId: string) => deleteThingsForSpace(orm, spaceId),
      },
      RepositoryState: {
        read: () => readRepositoryState(orm),
        relock: (metaSpaceId: string) => relockRepositoryState(orm, metaSpaceId),
        create: (metaSpaceId: string) => createRepositoryState(orm, metaSpaceId),
        delete: () => deleteRepositoryState(orm),
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
