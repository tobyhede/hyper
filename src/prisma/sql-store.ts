import type { SqlSpaceListRow, SqlStore, SqlTables } from '../persistence/sql-store';
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

/** PostgreSQL's `SqlStore`: `document` already decoded by the `jsonb` codec, never re-parsed here. */
export const postgresSqlStore = defineSqlStore({
  orm: db.orm.public,
  tables(orm: Orm): SqlTables<InferredOrder> {
    return {
      Space: {
        orderBy: (build) => orm.Space.orderBy(build),
        loadWithThings: (id: string) => loadWithThings(orm, id),
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
