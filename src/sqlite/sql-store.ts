import type { SqlSpaceListRow, SqlStore, SqlTables } from '../persistence/sql-store';
import type { SqliteDatabase } from './db';
import { serialiseSqlite } from './serialise';

type Orm = SqliteDatabase['orm'];

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
}

/**
 * SQLite's own answer to a losing insert: SQLSTATE 23505, with no
 * table/constraint precision to check further — the 0.16.0 driver does not
 * reliably carry one (ticket 23 records whether a later version does).
 */
const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  // SAFETY: checked above — error is a non-null object, so probing named
  // fields on it (each still typed unknown until compared) cannot throw.
  const candidate = error as SqlUniqueViolationFields;
  return candidate.kind === 'sql_query' && candidate.sqlState === '23505';
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
 * Same trick, over the whole `SqlStore` value: `Handle` is inferred from
 * what is passed rather than written out, so nothing here asserts a shape
 * the object literal does not actually have. `Order`, unlike `Handle`, is
 * named explicitly per database (`InferredOrder`) rather than inferred here
 * too — see `src/prisma/sql-store.ts`'s matching comment.
 */
const defineSqlStore = <Handle, Order>(store: SqlStore<Handle, Order>): SqlStore<Handle, Order> =>
  store;

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

  return defineSqlStore<Orm, InferredOrder>({
    orm,
    tables(scopedOrm: Orm): SqlTables<InferredOrder> {
      return {
        Space: {
          orderBy: (build) => scopedOrm.Space.orderBy(build),
          loadWithThings: (id: string) => loadWithThings(scopedOrm, id),
        },
      };
    },
    transaction<T>(fn: (orm: Orm) => Promise<T>): Promise<T> {
      return database.transaction((tx) => fn(tx.orm));
    },
    readDocument,
    isDuplicateKey(error: unknown): boolean {
      return isUniqueViolation(error);
    },
    serialise<T>(operation: () => Promise<T>): Promise<T> {
      return serialiseSqlite(database, operation);
    },
    close(): Promise<void> {
      return database.close();
    },
  });
};
