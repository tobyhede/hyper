import type { SqlTables } from '../persistence/sql-store';
import {
  asOrderable,
  buildRepositoryStateTable,
  buildSpaceTable,
  buildResourceTable,
  defineSqlStore,
  someCause,
  type Orderable,
} from '../persistence/sql-store';
import type { PostgresDatabase } from './db';

type Orm = PostgresDatabase['orm']['public'];
type Tx = Parameters<Parameters<PostgresDatabase['transaction']>[0]>[0];

interface Handle {
  readonly orm: Orm;
  readonly execute: Tx['execute'];
}

/**
 * `Order`, named once from a real, harmless reference to the live `orm` —
 * `asOrderable`'s call infers it, and this pulls it back out of the concrete
 * (if unwieldy) instantiation so `tables()` below can name it as an ordinary
 * return-type annotation. The binding itself is never read at runtime, only
 * through `typeof` below, hence the `_` — TypeScript's own convention for
 * "used as a type, not a value".
 */
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
 * The SQLSTATEs that mean PostgreSQL is contended or not answering rather than
 * that the request, the code or the configuration is wrong: a later attempt of
 * the same request is the cure. The one place the set is kept; ticket 31's
 * `## Answer` (amendment) records why each is in and why its neighbours are
 * not.
 *
 * - `08000`, `08001`, `08003`, `08004`, `08006` — connection exceptions.
 *   `08P01` (protocol violation) is left out: it is a client or server defect.
 * - `40001` serialization failure and `40P01` deadlock detected — the database
 *   aborted this transaction so another could proceed.
 * - `53300` too many connections.
 * - `55P03` lock not available.
 * - `57P01` admin shutdown, `57P02` crash shutdown, `57P03` cannot connect now.
 *   `57014` (query cancelled) is left out: a cancel can be deliberate.
 *
 * Read together with what is deliberately absent (ticket 38): `28P01` invalid
 * password, `28000` invalid authorization, and `3D000` a database that does
 * not exist are raised at connect exactly as `53300` and `57P03` are, but they
 * are the configuration or the server refusing this client, which no wait
 * cures — so they stay unclassified, and start-up counts them toward giving up.
 */
export const UNAVAILABLE_SQLSTATES = [
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '40001',
  '40P01',
  '53300',
  '55P03',
  '57P01',
  '57P02',
  '57P03',
] as const;

/**
 * The socket failures Node raises under `pool.connect()` that mean the server
 * is not answering for now, read off the errno name Node puts on `code`.
 *
 * - `ECONNREFUSED` — nothing is listening: the server is down or restarting.
 * - `ECONNRESET` — the peer dropped the connection mid-conversation.
 * - `ETIMEDOUT` — the peer did not answer in time.
 * - `EHOSTUNREACH`, `ENETUNREACH` — no route to the server right now.
 * - `EAI_AGAIN` — the resolver failed temporarily; the name may resolve next time.
 *
 * `ENOTFOUND` is left out: a host name that does not resolve is ordinarily a
 * mistyped `DATABASE_URL`, which no wait cures. So is every other code — an
 * allowlist, because a failure not named here is not evidence of an outage.
 */
const UNAVAILABLE_SOCKET_CODES = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
] as const;

const isUnavailableSqlState = (value: unknown): boolean =>
  UNAVAILABLE_SQLSTATES.some((code) => code === value);

const isUnavailableSocketCode = (value: unknown): boolean =>
  UNAVAILABLE_SOCKET_CODES.some((code) => code === value);

/** Whether `cause` is an error carrying an errno on `code` the allowlist does not name. */
const carriesUnlistedSocketCode = (cause: unknown): boolean =>
  cause instanceof Error &&
  'code' in cause &&
  typeof cause.code === 'string' &&
  !isUnavailableSocketCode(cause.code);

/**
 * PostgreSQL's `SqlStore.isUnavailable` (ticket 38): whether any error on the
 * failure's cause chain is one of three shapes, each read by a structured
 * field and never by message.
 *
 * - The driver's `SqlConnectionError`, read by its `kind`, unless
 *   the socket error on its `cause` carries a code outside
 *   {@link UNAVAILABLE_SOCKET_CODES}: `normalizePgError` names `ENOTFOUND` a
 *   connection failure too, and the allowlist decides a normalised socket
 *   failure as it does a raw one. One with no code — matched by the driver on
 *   its message — stays unavailable.
 * - The driver's `SqlQueryError` with a SQLSTATE in {@link UNAVAILABLE_SQLSTATES}
 *   on `sqlState`: `normalizePgError` turns every SQLSTATE failure on a
 *   statement into one, so contention and shutdown arrive that way.
 * - An error the driver never normalised, carrying on `code` an unavailable
 *   SQLSTATE or one of {@link UNAVAILABLE_SOCKET_CODES}. `@prisma-next/driver-postgres`
 *   acquires a connection with a bare `pool.connect()` and normalises nothing
 *   it raises, so a server that is down arrives as Node's own socket error and
 *   a server refusing the handshake as `pg`'s own `DatabaseError` — both with
 *   the code on `code` (`test/unit/postgres-unreachable.test.ts`).
 *
 * The chain, because a deadlock or serialization failure at COMMIT, and the
 * callback error behind a failed rollback, reach the repository wrapped.
 * `test/unit/sql-connection-failure.test.ts` holds each of these.
 */
const isUnavailable = (failure: unknown): boolean =>
  someCause(
    failure,
    (link) =>
      ('kind' in link &&
        link.kind === 'sql_connection' &&
        !carriesUnlistedSocketCode(link.cause)) ||
      ('kind' in link &&
        link.kind === 'sql_query' &&
        'sqlState' in link &&
        isUnavailableSqlState(link.sqlState)) ||
      ('code' in link && (isUnavailableSqlState(link.code) || isUnavailableSocketCode(link.code))),
  );

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
export const postgresSqlStore = (database: PostgresDatabase) => {
  const orm = database.orm.public;
  const _orderProbe = asOrderable(orm.Space);
  type InferredOrder = typeof _orderProbe extends Orderable<infer O> ? O : never;
  return defineSqlStore({
    orm: { orm, execute: (plan, options) => database.runtime().execute(plan, options) },
    tables({ orm }: Handle): SqlTables<InferredOrder> {
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
    transaction<T>(fn: (handle: Handle) => Promise<T>): Promise<T> {
      return database.transaction((tx) => fn({ orm: tx.orm.public, execute: tx.execute }));
    },
    async lockAggregate(handle: Handle): Promise<void> {
      // The fixed database-local pair is Hyper's aggregate lock namespace and
      // singleton identity, independent of which (if any) Meta Space exists.
      // Prisma Next 0.16.0's facade exposes raw expressions, not standalone
      // statements. count(*) guarantees one projection even on the empty
      // singleton table, so the volatile lock call always runs exactly once.
      const plan = database.sql.public.repository_state
        .select(() => ({
          count: database.raw`count(*)::integer`.returns('pg/int4@1'),
          lock: database.raw`pg_advisory_xact_lock(1213812818, 1)::text`.returns('pg/text@1'),
        }))
        .build();
      await handle.execute(plan);
    },
    async lockAggregateShared(handle: Handle): Promise<void> {
      // `lockAggregate`'s key in shared mode, built the same way: shared
      // holders do not wait for each other, and wait for, or are waited on by,
      // the exclusive holder. The two keys must stay identical
      // (`test/unit/postgres-aggregate-lock-key.test.ts`).
      const plan = database.sql.public.repository_state
        .select(() => ({
          count: database.raw`count(*)::integer`.returns('pg/int4@1'),
          lock: database.raw`pg_advisory_xact_lock_shared(1213812818, 1)::text`.returns(
            'pg/text@1',
          ),
        }))
        .build();
      await handle.execute(plan);
    },
    readDocument(value: unknown): unknown {
      return value;
    },
    isDuplicateKey(error: unknown, table: string): boolean {
      return isPrimaryKeyConflict(error, table);
    },
    isUnavailable,
    serialise<T>(operation: () => Promise<T>): Promise<T> {
      return operation();
    },
    close(): Promise<void> {
      return database.close();
    },
  });
};
