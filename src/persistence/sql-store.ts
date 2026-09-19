/**
 * A JSON-compatible value, and the one converter every write of a stored
 * `document` column goes through on both databases (ADR 0095) — hoisted here,
 * rather than duplicated per adapter as it was before this ticket, because it
 * is identical logic, not a database difference. Refuses a non-finite number
 * or a genuinely non-JSON value (a function, a `bigint`, …) and drops an
 * object property whose value is `undefined` rather than writing a `null` the
 * author never authored.
 */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const toJsonValue = (value: unknown): JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    const object: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) object[key] = toJsonValue(child);
    }
    return object;
  }
  throw new TypeError(`Value of type ${typeof value} is not JSON-compatible`);
};

/**
 * The row shape `listSpaces` reads off an unfiltered `Space.orderBy(...).all()`
 * — property syntax, no optional fields, `document` left `unknown` because
 * each database hands it back differently decoded (ADR 0095).
 */
export interface SqlSpaceListRow {
  readonly id: string;
  readonly document: unknown;
}

/**
 * The row shape `Space.loadAllForReplacement` reads: every stored Space's id
 * and revision, ascending, and deliberately nothing else. `replaceAggregate`'s
 * per-row relock (ADR 0094) must tolerate a `document` that does not even
 * parse as JSON, so this never selects that column at all — the one way to
 * guarantee reading it cannot itself throw on broken stored state, on either
 * database.
 */
export interface SqlSpaceRevisionRow {
  readonly id: string;
  readonly revision: string;
}

/** A Thing nested under a loaded Space's `things` (ADR 0095's `Tables` rules). */
export interface SqlThingRow {
  readonly id: string;
  readonly document: unknown;
}

/**
 * The row shape `loadSpace` reads off `Space.where({ id }).include('things',
 * …).first()`. `revision`/`exportedRevision` are canonical decimal TEXT on
 * both databases now (ADR 0095), so this shape is exactly the same whichever
 * database answered it.
 */
export interface SqlLoadedSpaceRow {
  readonly id: string;
  readonly document: unknown;
  readonly revision: string;
  readonly exportedRevision: string | null;
  readonly things: readonly SqlThingRow[];
}

/**
 * The structural handle onto the generated ORM's `Space`/`Thing`/
 * `RepositoryState` collections that this repository calls through —
 * "declared by the repository over the calls it makes" (ADR 0095), grown as
 * later tickets add more calls rather than modelling the ORM's full surface.
 * Property syntax throughout, so a real collection's more permissive method
 * signatures are checked contravariantly against these and both generated
 * ORMs are assignable without a cast; no optional row field, and every
 * document stays `unknown` until a schema parses it.
 *
 * `Order` is the one opaque type parameter each database module derives from
 * its own generated collection type (`src/prisma/sql-store.ts`,
 * `src/sqlite/sql-store.ts`) rather than this file authoring its shape — what
 * a field accessor's `.asc()` answers inside `.orderBy(...)`.
 *
 * `Space.loadWithThings` is `.where({ id }).include('things', (things) =>
 * things.select('id', 'document').orderBy((thing) => thing.id.asc())).first()`
 * composed once, inside each database module's own `tables()`, rather than a
 * chain this interface exposes for the repository to compose generically.
 * `.include`'s own generated signature carries a *second* opaque type — the
 * relation's refined collection, called `Include` in the ADR 0095 typing
 * experiment (2026-09-17, `tsc` 7.0.2, since deleted) — and every way tried
 * here of keeping it opaque across this module boundary (backward inference
 * through one call solving for both parameters at once, backward inference
 * split across two calls, conditional-type `infer` extraction, a
 * method-scoped generic related directly against the ORM's own signature,
 * constrained and unconstrained) left it `Collection<Contract, never, …>` or
 * refused the covariant return check outright — `unknown` is not assignable
 * to it, same as `OrderByItem`, but unlike `OrderByItem` nothing here can
 * name a concrete stand-in without depending on `@prisma-next/sql-orm-client`
 * internals no package.json lists directly. Composing `.include(...)` inside
 * the database module — ordinary forward-typed code, the same shape
 * `loadStoredSpace` already runs in both existing adapters -- sidesteps the
 * cross-module generic relation entirely; only its *result* crosses this
 * interface, typed as the concrete `SqlLoadedSpaceRow`.
 *
 * Ticket 23 grew this the same way, for the Meta lifecycle: every added
 * member is either a plain, already-composed CRUD operation over one row (no
 * relation, no `Order`, ordinary forward-typed code identical in shape to
 * what both existing adapters already run) or, for `Space.loadEvery`, a
 * second already-composed read that carries the *same* raw-document
 * treatment `loadWithThings` does not need but the aggregate-wide read always
 * has: a document that fails even to parse as JSON must reach the repository
 * as data to classify (`AggregateInvariantError`, ADR 0094's truncation of
 * broken stored state), never as a driver codec's own thrown `TypeError`. On
 * PostgreSQL that is nothing special -- `jsonb` refuses non-JSON text before
 * it is ever stored, so `loadEvery` reads through the ordinary ORM the same
 * way `loadWithThings` does. On SQLite it is not: `document` decodes through
 * the driver's json codec on *any* ORM-level read that selects it, throwing
 * on text that is not JSON, so `Space.loadEvery` there reads through the
 * lower-level `sql`/`execute` builder instead (exactly as the pre-ticket-23
 * `SqliteSpaceRepository.loadEverySpace` did), which can override a column's
 * codec on the way out and hand back the raw text for the repository's own
 * per-row classification to parse and catch. That lower-level `execute` is
 * why SQLite's own `Handle` (`src/sqlite/sql-store.ts`) is not the bare `Orm`
 * ticket 22 left it as -- see that module's doc comment.
 */
export interface SqlTables<Order> {
  readonly Space: {
    readonly orderBy: (build: (space: { readonly id: { readonly asc: () => Order } }) => Order) => {
      readonly all: () => PromiseLike<readonly SqlSpaceListRow[]>;
    };
    readonly loadWithThings: (id: string) => Promise<SqlLoadedSpaceRow | null>;
    /** Every stored Space, with its Things, ascending by id -- the Meta lifecycle's aggregate read. */
    readonly loadEvery: () => PromiseLike<readonly SqlLoadedSpaceRow[]>;
    /** `SqlSpaceRevisionRow`'s own doc comment explains why `document` is never among these. */
    readonly loadAllForReplacement: () => PromiseLike<readonly SqlSpaceRevisionRow[]>;
    /**
     * Take one stored Space's row lock without disturbing its `revision`, and
     * answer the revision it actually carries once that lock is granted --
     * `undefined` when there is no such row. `replaceAggregate`'s per-row
     * re-lock and revision re-check (ADR 0095) during truncation: the row this
     * writes a placeholder `document` into is about to be deleted by the
     * truncation that always follows immediately in the same transaction, or
     * the whole transaction rolls back on a mismatch, so what is written here
     * is never observed either way -- only whether the row was still there,
     * and at the revision already read, is.
     */
    readonly relock: (id: string) => Promise<string | undefined>;
    readonly create: (input: {
      readonly id: string;
      readonly document: unknown;
      readonly revision: string;
    }) => Promise<void>;
    readonly listIds: () => Promise<readonly string[]>;
    readonly deleteById: (id: string) => Promise<void>;
    /** Answers whether the row existed to update. */
    readonly setExportedRevision: (id: string, revision: string) => Promise<boolean>;
  };
  readonly Thing: {
    readonly create: (input: {
      readonly id: string;
      readonly spaceId: string;
      readonly document: unknown;
    }) => Promise<void>;
    readonly deleteAllForSpace: (spaceId: string) => Promise<void>;
  };
  readonly RepositoryState: {
    readonly read: () => Promise<{ readonly metaSpaceId: string } | null>;
    /** The self-update `lockMetaIdentity` takes its row lock with. Answers whether the row was still there. */
    readonly relock: (metaSpaceId: string) => Promise<boolean>;
    readonly create: (metaSpaceId: string) => Promise<void>;
    readonly delete: () => Promise<void>;
  };
}

/**
 * What a database contributes so the one SQL repository can read and write
 * it, and nothing more (ADR 0095). A member added here is a place the two
 * databases have begun to differ again, and needs a reason.
 *
 * - `orm` — the handle for work outside a transaction, already resolved to
 *   the repository's one namespace (`db.orm.public` on PostgreSQL, the
 *   already-unbound `database.orm` on SQLite) so `tables(orm)` takes the same
 *   shape whichever database supplied it. `Handle` is opaque to this
 *   repository beyond that: PostgreSQL's is the bare ORM namespace, and
 *   SQLite's (ticket 23) additionally carries what `Space.loadEvery` needs to
 *   read a document that may not even be JSON without the driver's codec
 *   throwing (`src/sqlite/sql-store.ts`'s doc comment).
 * - `tables(orm)` — the structural view over `orm` (or a transaction's own
 *   handle, which shares `Handle`'s type) this repository calls through.
 * - `transaction` — runs a unit of work under the database's own
 *   transaction, handing the callback the same `Handle` shape `orm` is.
 * - `readDocument` — decodes a stored `document`/`document` cell into a plain
 *   value a schema can parse: identity on PostgreSQL, whose `jsonb` codec
 *   already decoded it; `JSON.parse` on SQLite's TEXT, which only decodes at
 *   the ORM boundary for a root read, not a nested `include`.
 * - `isDuplicateKey(error, table)` — recognises a primary-key collision, the
 *   one thing the two databases raise differently under a losing insert.
 * - `serialise` — PostgreSQL runs the operation directly; SQLite queues it
 *   per file handle (`src/sqlite/serialise.ts`), because the driver opens a
 *   connection per operation and the file has one writer.
 * - `close` — releases whatever connection or handle the database opened.
 */
export interface SqlStore<Handle, Order> {
  readonly orm: Handle;
  tables(orm: Handle): SqlTables<Order>;
  transaction<T>(fn: (orm: Handle) => Promise<T>): Promise<T>;
  readDocument(value: unknown): unknown;
  isDuplicateKey(error: unknown, table: string): boolean;
  serialise<T>(operation: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
