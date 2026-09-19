import type { SqlSpaceListRow, SqlStore, SqlTables } from '../persistence/sql-store';
import { toJsonValue } from '../persistence/sql-store';
import type { SqliteDatabase } from './db';
import { serialiseSqlite } from './serialise';

type Orm = SqliteDatabase['orm'];
/**
 * The transaction context `SqliteDatabase['transaction']`'s callback receives.
 * `Handle` below is built from this rather than from `Orm` alone, because
 * `Space.loadEvery` needs the same lower-level `sql`/`execute` access
 * `SqliteSpaceRepository.loadEverySpace` used before ticket 23 (see
 * `SqlTables`'s doc comment in `../persistence/sql-store`).
 */
type Tx = Parameters<Parameters<SqliteDatabase['transaction']>[0]>[0];

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

interface SqlUniqueViolationFields {
  readonly kind?: unknown;
  readonly sqlState?: unknown;
  readonly constraint?: unknown;
}

/**
 * SQLite's own answer to a losing insert: SQLSTATE 23505, matched against the
 * `<table>.<column>` constraint text `SqlQueryError.constraint` carries on
 * the pinned 0.16.0 driver.
 *
 * Investigated for ticket 23 against a real duplicate-key error on both
 * `spaces` and `repository_state` (`@prisma-next/driver-sqlite`'s
 * `normalizeSqliteError`, 0.16.0): the driver's own `SqlQueryError.table` is
 * always `undefined` — nothing sets it — but `.constraint` is not; it is
 * parsed from SQLite's own message (`UNIQUE constraint failed: <table>.
 * <column>`) into exactly that `<table>.<column>` text, e.g. `spaces.id` or
 * `repository_state.singleton_id`. That reaches PostgreSQL's table precision
 * despite arriving through a different field, so this checks `constraint`
 * rather than the ever-`undefined` `table`.
 */
const isUniqueViolation = (error: unknown, table: string): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  // SAFETY: checked above — error is a non-null object, so probing named
  // fields on it (each still typed unknown until compared) cannot throw.
  const candidate = error as SqlUniqueViolationFields;
  return (
    candidate.kind === 'sql_query' &&
    candidate.sqlState === '23505' &&
    typeof candidate.constraint === 'string' &&
    candidate.constraint.startsWith(`${table}.`)
  );
};

/**
 * SQLite stores Json as TEXT. A root-level read decodes it through the json
 * codec and answers an object — the whole row, `.select('id', 'document')`
 * and the root of an `.include()` read alike; only a field read as a
 * *nested relation inside `.include()`* answers the stored string, which is
 * how a loaded Space's `things` documents arrive. Both are valid driver
 * output, so this parses a string here rather than asking the repository to
 * accept two shapes.
 */
const readDocument = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  // SAFETY: JSON.parse is the stored-document boundary; schemas parse next.
  return JSON.parse(value) as unknown;
};

/**
 * `Space.where({ id }).include('things', …).first()`, composed once here
 * rather than by the shared repository (`SqlTables`'s doc comment explains
 * why `.include(...)` cannot cross that boundary generically). The nested
 * `things` documents arrive as raw TEXT (this module's `readDocument`
 * decodes them); the shared repository's schema parses them next either way.
 */
const loadWithThings = (orm: Orm, id: string) =>
  orm.Space.where({ id })
    .include('things', (things) =>
      things.select('id', 'document').orderBy((thing) => thing.id.asc()),
    )
    .first();

/**
 * Every stored Space with its Things, ascending by id — read through the
 * lower-level `sql`/`execute` builder rather than the ORM, so that a
 * `document` that is not even JSON reaches the repository's own per-row
 * classification as raw text instead of throwing inside the driver's json
 * codec before any of this module's code runs (`SqlTables`'s doc comment).
 * This is `SqliteSpaceRepository.loadEverySpace`'s pre-ticket-23 read,
 * unchanged in technique and moved here; its own extended doc comment (see
 * `git log` on that file) is the fuller account of why two raw-text
 * statements rather than one `include` read, and why `document`'s codec is
 * overridden to `'sqlite/text@1'` on the way out.
 *
 * `database.sql`/`database.raw` are stateless plan builders — the exact same
 * type whichever handle names them (`SqliteClient.sql`/`SqliteTransactionContext.sql`
 * share one `UnboundSql<TContract>` type) — so they are read from `database`'s
 * own closure rather than threaded through `Handle`; only `execute`, which
 * runs a built plan against one specific connection, has to come from the
 * `Handle` this call is running under.
 */
const loadEvery = async (database: SqliteDatabase, handle: Handle) => {
  const spacesPlan = database.sql.spaces
    .select((fields) => ({
      id: fields.id,
      document: database.raw`document`.returns('sqlite/text@1'),
      revision: fields.revision,
      exportedRevision: fields.exported_revision,
    }))
    .orderBy('id', { direction: 'asc' })
    .build();
  const spaceRows = await handle.execute(spacesPlan);

  const thingsPlan = database.sql.things
    .select((fields) => ({
      id: fields.id,
      spaceId: fields.space_id,
      document: database.raw`document`.returns('sqlite/text@1'),
    }))
    .orderBy('id', { direction: 'asc' })
    .build();
  const thingRows = await handle.execute(thingsPlan);

  const thingsBySpace = new Map<string, { readonly id: string; readonly document: unknown }[]>();
  for (const thing of thingRows) {
    const row = { id: thing.id, document: thing.document };
    const existing = thingsBySpace.get(thing.spaceId);
    if (existing === undefined) thingsBySpace.set(thing.spaceId, [row]);
    else existing.push(row);
  }

  return spaceRows.map((space) => ({
    id: space.id,
    document: space.document,
    revision: space.revision,
    exportedRevision: space.exportedRevision,
    things: thingsBySpace.get(space.id) ?? [],
  }));
};

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
 * `deleteCount()` rather than `delete()`: the latter returns the deleted row
 * -- a root-level read, so its `document` decodes through SQLite's json codec
 * on the way back (this module's own doc comment on `readDocument`) -- and a
 * truncation this answers for (ADR 0094) deletes whatever is stored whether
 * or not `document` parses, so this must never decode it. The same
 * requirement `deleteExcept`/`deleteAllForSpace` below carry for Things; it
 * is what `truncates a stored Space whose Thing document is not JSON` in
 * `test/integration/sqlite-space-repository.test.ts` holds.
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

/**
 * Same trick, over the whole `SqlStore` value: `Handle` is inferred from
 * what is passed rather than written out, so nothing here asserts a shape
 * the object literal does not actually have. `Order`, unlike `Handle`, is
 * named explicitly per database (`InferredOrder`) rather than inferred here
 * too — see `src/prisma/sql-store.ts`'s matching comment.
 */
const defineSqlStore = <Handle, Order>(store: SqlStore<Handle, Order>): SqlStore<Handle, Order> =>
  store;

/**
 * What `tables(handle)` calls through, on either side of a transaction
 * boundary: `orm` for the ordinary ORM calls every other member runs, and
 * `execute` for `loadEvery`'s lower-level plans. A transaction's own context
 * (`Tx`) carries strictly more than this — `sql`, `enums`, `invalidated` —
 * so passing one where a `Handle` is expected needs no conversion; only the
 * non-transactional case (`sqliteSqlStore`'s own `orm` field below) has to
 * build one, since `SqliteClient` carries no bound `execute` of its own
 * outside `.runtime()`.
 */
interface Handle {
  readonly orm: Orm;
  readonly execute: Tx['execute'];
}

/** SQLite's `SqlStore`, built over one file handle. */
export const sqliteSqlStore = (database: SqliteDatabase) => {
  const orm = database.orm;
  /**
   * `Order`, named once from a real, harmless reference to this handle's
   * `orm` — `asOrderable`'s call infers it, and this pulls it back out of
   * the concrete (if unwieldy) instantiation so `tables()` below can name it
   * as an ordinary return-type annotation. The binding itself is never read
   * at runtime, only through `typeof` below, hence the `_` — TypeScript's
   * own convention for "used as a type, not a value".
   */
  const _orderProbe = asOrderable(orm.Space);
  type InferredOrder = typeof _orderProbe extends Orderable<infer O> ? O : never;

  /**
   * The non-transactional `Handle`. `orm` is `database.orm` directly; `execute`
   * runs against `database.runtime()`, called fresh on every invocation rather
   * than cached once, so this never holds on to a stale runtime reference.
   * Nothing in this repository actually calls `Space.loadEvery` outside a
   * transaction — `loadAggregate`/`initializeAggregate`/`replaceAggregate` all
   * open one — but `Handle` is one type for both cases, so this still has to
   * be a genuine, working value of it.
   */
  const nonTransactionalHandle: Handle = {
    orm,
    execute: (plan, options) => database.runtime().execute(plan, options),
  };

  return defineSqlStore<Handle, InferredOrder>({
    orm: nonTransactionalHandle,
    tables(handle: Handle): SqlTables<InferredOrder> {
      return {
        Space: {
          orderBy: (build) => handle.orm.Space.orderBy(build),
          loadWithThings: (id: string) => loadWithThings(handle.orm, id),
          loadEvery: () => loadEvery(database, handle),
          loadAllForReplacement: () => loadAllForReplacement(handle.orm),
          relock: (id: string) => relock(handle.orm, id),
          create: (input) => createSpace(handle.orm, input),
          listIds: () => listSpaceIds(handle.orm),
          deleteById: (id: string) => deleteSpaceById(handle.orm, id),
          setExportedRevision: (id: string, revision: string) =>
            setExportedRevision(handle.orm, id, revision),
          writeDocumentUnderLock: (id: string, document: unknown) =>
            writeDocumentUnderLock(handle.orm, id, document),
          setRevision: (id: string, revision: string) => setRevision(handle.orm, id, revision),
        },
        Thing: {
          create: (input) => createThing(handle.orm, input),
          upsert: (input) => upsertThing(handle.orm, input),
          deleteExcept: (spaceId: string, keepIds: readonly string[]) =>
            deleteThingsExcept(handle.orm, spaceId, keepIds),
          deleteAllForSpace: (spaceId: string) => deleteThingsForSpace(handle.orm, spaceId),
        },
        RepositoryState: {
          read: () => readRepositoryState(handle.orm),
          relock: (metaSpaceId: string) => relockRepositoryState(handle.orm, metaSpaceId),
          create: (metaSpaceId: string) => createRepositoryState(handle.orm, metaSpaceId),
          delete: () => deleteRepositoryState(handle.orm),
        },
      };
    },
    transaction<T>(fn: (handle: Handle) => Promise<T>): Promise<T> {
      return database.transaction((tx) => fn(tx));
    },
    readDocument,
    isDuplicateKey(error: unknown, table: string): boolean {
      return isUniqueViolation(error, table);
    },
    serialise<T>(operation: () => Promise<T>): Promise<T> {
      return serialiseSqlite(database, operation);
    },
    close(): Promise<void> {
      return database.close();
    },
  });
};
