/**
 * The row shape `listSpaces` reads off an unfiltered `Space.orderBy(...).all()`
 * — property syntax, no optional fields, `document` left `unknown` because
 * each database hands it back differently decoded (ADR 0095).
 */
export interface SqlSpaceListRow {
  readonly id: string;
  readonly document: unknown;
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
 * `loadStoredSpace` already runs in both existing adapters — sidesteps the
 * cross-module generic relation entirely; only its *result* crosses this
 * interface, typed as the concrete `SqlLoadedSpaceRow`. Ticket 23's own pass
 * revisits whether the deleted experiment's approach is recoverable before
 * `Tables` grows the write-side calls.
 */
export interface SqlTables<Order> {
  readonly Space: {
    readonly orderBy: (build: (space: { readonly id: { readonly asc: () => Order } }) => Order) => {
      readonly all: () => PromiseLike<readonly SqlSpaceListRow[]>;
    };
    readonly loadWithThings: (id: string) => Promise<SqlLoadedSpaceRow | null>;
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
 *   shape whichever database supplied it.
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
