import type { SqlTables } from '../persistence/sql-store';
import {
  asOrderable,
  buildRepositoryStateTable,
  buildSpaceTable,
  buildResourceTable,
  defineSqlStore,
  isDriverConnectionFailure,
  someCause,
  type Orderable,
} from '../persistence/sql-store';
import type { SqliteDatabase } from './db';
import { serialiseSqlite } from './serialise';

type Orm = SqliteDatabase['orm'];
/**
 * The transaction context `SqliteDatabase['transaction']`'s callback receives.
 * `Handle` below is built from this rather than from `Orm` alone, because
 * `Space.loadEvery` below needs the same lower-level `sql`/`execute` access
 * (see `SqlTables`'s doc comment in `../persistence/sql-store`).
 */
type Tx = Parameters<Parameters<SqliteDatabase['transaction']>[0]>[0];

interface SqlUniqueViolationFields {
  readonly kind?: unknown;
  readonly sqlState?: unknown;
  readonly constraint?: unknown;
}

/**
 * SQLite's own answer to a losing insert: SQLSTATE 23505, matched against the
 * `<table>.<column>` constraint text `SqlQueryError.constraint` carries on
 * the pinned 0.16.0 driver. The driver's own `SqlQueryError.table` is always
 * `undefined` — nothing on this driver sets it (`@prisma-next/driver-sqlite`'s
 * `normalizeSqliteError`) — but `.constraint` is not; it is parsed from
 * SQLite's own message (`UNIQUE constraint failed: <table>.<column>`) into
 * exactly that `<table>.<column>` text, e.g. `spaces.id` or
 * `repository_state.singleton_id`. That reaches PostgreSQL's table precision
 * despite arriving through a different field, so this checks `constraint`
 * rather than the ever-`undefined` `table` — ticket 23's Answer records the
 * investigation against a real duplicate-key error on both tables.
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
 * The message `@prisma-next/sqlite`'s runtime (pinned at 0.16.0) raises for a
 * query, a transaction or a `connect` on a client whose `close()` has run: a
 * plain `Error`, built in its `getRuntime`, `connect` and `transaction` with
 * nothing structured on it. A compatibility check against that one runtime,
 * and the only failure either store recognises by message (ticket 38): a
 * closed client is the database not answering, and no field says so. Nothing
 * else observed after a close is read as unavailable. Exactly `Error` and exactly
 * this text, so neither a subclass nor another message is read as it —
 * `test/unit/sql-connection-failure.test.ts` raises it from the pinned runtime
 * itself, so an upgrade that changes it fails there.
 */
const CLOSED_CLIENT_MESSAGE = 'SQLite client is closed';

const isClosedClient = (error: unknown): boolean =>
  someCause(
    error,
    (link) =>
      Object.getPrototypeOf(link) === Error.prototype && link.message === CLOSED_CLIENT_MESSAGE,
  );

/**
 * SQLite stores Json as TEXT. A root-level read decodes it through the json
 * codec and answers an object — the whole row, `.select('id', 'document')`
 * and the root of an `.include()` read alike; only a field read as a
 * *nested relation inside `.include()`* answers the stored string, which is
 * how a loaded Space's `resources` documents arrive. Both are valid driver
 * output, so this parses a string here rather than asking the repository to
 * accept two shapes.
 */
const readDocument = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  // SAFETY: JSON.parse is the stored-document boundary; schemas parse next.
  return JSON.parse(value) as unknown;
};

/**
 * `Space.where({ id }).include('resources', …).first()`, composed once here
 * rather than by the shared repository (`SqlTables`'s doc comment explains
 * why `.include(...)` cannot cross that boundary generically). The nested
 * `resources` documents arrive as raw TEXT (this module's `readDocument`
 * decodes them); the shared repository's schema parses them next either way.
 */
const loadWithResources = (orm: Orm, id: string) =>
  orm.Space.where({ id })
    .include('resources', (resources) =>
      resources.select('id', 'document').orderBy((resource) => resource.id.asc()),
    )
    .first();

/**
 * Every stored Space with its Resources, ascending by id — read through the
 * lower-level `sql`/`execute` builder rather than the ORM, so that a
 * `document` that is not even JSON reaches the repository's own per-row
 * classification as raw text instead of throwing inside the driver's json
 * codec before any of this module's code runs (`SqlTables`'s doc comment).
 * Two raw-text statements rather than one `include` read, because the
 * lower-level builder used below has no relation support of its own to
 * express the nested `resources` read in one statement; `document`'s codec is
 * overridden to `'sqlite/text@1'` on the way out so the raw stored text
 * reaches the repository unparsed.
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

  const resourcesPlan = database.sql.resources
    .select((fields) => ({
      id: fields.id,
      spaceId: fields.space_id,
      document: database.raw`document`.returns('sqlite/text@1'),
    }))
    .orderBy('id', { direction: 'asc' })
    .build();
  const resourceRows = await handle.execute(resourcesPlan);

  const resourcesBySpace = new Map<string, { readonly id: string; readonly document: unknown }[]>();
  for (const resource of resourceRows) {
    const row = { id: resource.id, document: resource.document };
    const existing = resourcesBySpace.get(resource.spaceId);
    if (existing === undefined) resourcesBySpace.set(resource.spaceId, [row]);
    else existing.push(row);
  }

  return spaceRows.map((space) => ({
    id: space.id,
    document: space.document,
    revision: space.revision,
    exportedRevision: space.exportedRevision,
    resources: resourcesBySpace.get(space.id) ?? [],
  }));
};

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
        Space: buildSpaceTable(
          handle.orm.Space,
          (id: string) => loadWithResources(handle.orm, id),
          () => loadEvery(database, handle),
        ),
        Resource: buildResourceTable(
          handle.orm.Resource,
          (spaceId: string, keepIds: readonly string[]) =>
            deleteResourcesExcept(handle.orm, spaceId, keepIds),
        ),
        RepositoryState: buildRepositoryStateTable(handle.orm.RepositoryState),
      };
    },
    transaction<T>(fn: (handle: Handle) => Promise<T>): Promise<T> {
      return database.transaction((tx) => fn(tx));
    },
    lockAggregate(): Promise<void> {
      // SQLite keeps one transaction snapshot even before Meta exists. Its
      // file locks refuse a stale reader's write upgrade (BUSY/LOCKED), rather
      // than letting later statements mix that snapshot with a new aggregate.
      // serialise queues same-handle work; other handles retain that refusal.
      return Promise.resolve();
    },
    lockAggregateShared(): Promise<void> {
      // The same file locks and same-handle queue `lockAggregate` relies on
      // already keep a fast-path read and its write from straddling another
      // writer's commit (`test/integration/sqlite-fast-path-races.test.ts`).
      return Promise.resolve();
    },
    readDocument,
    isDuplicateKey(error: unknown, table: string): boolean {
      return isUniqueViolation(error, table);
    },
    isUnavailable(error: unknown): boolean {
      return isDriverConnectionFailure(error) || isClosedClient(error);
    },
    serialise<T>(operation: () => Promise<T>): Promise<T> {
      return serialiseSqlite(database, operation);
    },
    close(): Promise<void> {
      return database.close();
    },
  });
};
