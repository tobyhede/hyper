/**
 * A JSON-compatible value, and the one converter every write of a stored
 * `document` column goes through on both databases (ADR 0095) — declared once
 * here rather than duplicated per database, because it is identical logic,
 * not a database difference. Refuses a non-finite number
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
 * declared by the repository over exactly the calls it makes (ADR 0095),
 * rather than modelling the ORM's full surface. Property syntax throughout,
 * so a real collection's more permissive method signatures are checked
 * contravariantly against these and both generated ORMs are assignable
 * without a cast; no optional row field, and every document stays `unknown`
 * until a schema parses it.
 *
 * `Order` is the one opaque type parameter each database module derives from
 * its own generated collection type (`src/prisma/sql-store.ts`,
 * `src/sqlite/sql-store.ts`) rather than this file authoring its shape — what
 * a field accessor's `.asc()` answers inside `.orderBy(...)`.
 *
 * Every member is a plain, already-composed CRUD operation with a shared
 * implementation below (`buildSpaceTable`/`buildThingTable`/
 * `buildRepositoryStateTable` and the functions they call), except three that
 * each database module still composes for itself — `Space.loadWithThings`,
 * `Space.loadEvery` and `Thing.deleteExcept` — each carrying its own doc
 * comment below explaining why.
 */
export interface SqlTables<Order> {
  readonly Space: {
    readonly orderBy: (build: (space: { readonly id: { readonly asc: () => Order } }) => Order) => {
      readonly all: () => PromiseLike<readonly SqlSpaceListRow[]>;
    };
    /**
     * `.where({ id }).include('things', (things) => things.select('id',
     * 'document').orderBy((thing) => thing.id.asc())).first()`, composed
     * once inside each database module's own `tables()` rather than a chain
     * this interface exposes for the repository to compose generically.
     * `.include`'s own generated signature carries a *second* opaque type —
     * the relation's refined collection — that cannot be named without
     * depending on `@prisma-next/sql-orm-client` internals no package.json
     * lists directly, and cannot be kept opaque across this module boundary
     * either; ticket 22's Answer
     * (`.scratch/database-persistence/issues/22-…`) records what was tried.
     * Composing `.include(...)` inside the database module — ordinary
     * forward-typed code, the same shape the repository's own
     * `#loadStoredSpaceRow` calls through this — sidesteps the cross-module
     * generic relation entirely; only its *result* crosses this interface,
     * typed as the concrete `SqlLoadedSpaceRow`.
     */
    readonly loadWithThings: (id: string) => Promise<SqlLoadedSpaceRow | null>;
    /**
     * Every stored Space, with its Things, ascending by id -- the Meta
     * lifecycle's aggregate read. Carries the *same* raw-document treatment
     * `loadWithThings` above does not need but this always has: a document
     * that fails even to parse as JSON must reach the repository as data to
     * classify (`AggregateInvariantError`, ADR 0094's truncation of broken
     * stored state), never as a driver codec's own thrown `TypeError`. On
     * PostgreSQL that is nothing special -- `jsonb` refuses non-JSON text
     * before it is ever stored, so this reads through the ordinary ORM the
     * same way `loadWithThings` does. On SQLite it is not: `document`
     * decodes through the driver's json codec on *any* ORM-level read that
     * selects it, throwing on text that is not JSON, so `Space.loadEvery`
     * there reads through the lower-level `sql`/`execute` builder instead,
     * which can override a column's codec on the way out and hand back the
     * raw text for the repository's own per-row classification to parse and
     * catch. That lower-level `execute` is why SQLite's own `Handle`
     * (`src/sqlite/sql-store.ts`) carries more than the bare `Orm` -- see
     * that module's doc comment.
     */
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
    /**
     * Answers whether the row existed to delete — `commit`'s own `delete`
     * change needs to know, and `#truncateHyperContent` (ADR 0094) calls this
     * too, over stored state it has never validated. So this must never
     * decode `document`: each database module answers it through a
     * count-only delete rather than one that returns the deleted row, which
     * a stored document failing even to parse as JSON would otherwise throw
     * out of on SQLite (`Thing.deleteAllForSpace`'s doc comment carries the
     * fuller account).
     */
    readonly deleteById: (id: string) => Promise<boolean>;
    /** Answers whether the row existed to update. */
    readonly setExportedRevision: (id: string, revision: string) => Promise<boolean>;
    /**
     * `commit`'s own row lock (ADR 0095): write one Space's real
     * document under the row's write lock, and answer the revision the row
     * carried when that lock was granted — `undefined` when there is no such
     * row. Leaves `revision` itself untouched, so the caller's comparison
     * against what this returns cannot go stale; `setRevision` is the second,
     * separate write once that comparison holds. Distinct from `relock`
     * above, which never writes a row's real content — a commit's write
     * genuinely means to replace the document once the lock is confirmed, so
     * it cannot share `relock`'s placeholder. `SqlSpaceRepository`'s own doc
     * comment states the write order the one helper shared by the fast
     * (topology-preserving) path and the complete-aggregate path keeps.
     */
    readonly writeDocumentUnderLock: (id: string, document: unknown) => Promise<string | undefined>;
    /** The second write `writeDocumentUnderLock`'s caller makes once its revision comparison holds. */
    readonly setRevision: (id: string, revision: string) => Promise<void>;
  };
  readonly Thing: {
    readonly create: (input: {
      readonly id: string;
      readonly spaceId: string;
      readonly document: unknown;
    }) => Promise<void>;
    /**
     * Create or replace one Thing's document, answering the Space id the row
     * actually belongs to — which the caller compares against the Space it
     * meant to write. `commit`'s update path has no losing insert
     * to catch the way `create` does: the row already exists, and this
     * overwrites it, so ownership is read back instead of thrown from a
     * duplicate key.
     */
    readonly upsert: (input: {
      readonly id: string;
      readonly spaceId: string;
      readonly document: unknown;
    }) => Promise<{ readonly spaceId: string }>;
    /**
     * Delete every Thing owned by `spaceId` whose id is not in `keepIds` —
     * `commit`'s own drop of the Things a snapshot removed. Runs on both the
     * fast and complete-aggregate write paths through the one shared write
     * helper; an empty `keepIds` deletes every Thing the Space owns, and on
     * the fast path `keepIds` is always every Thing already there, so
     * nothing is ever actually dropped. The one CRUD member each database
     * module still composes for itself: its second `.where(...)` call takes
     * a query-builder callback (`(thing) => thing.id.notIn(keepIds)`) whose
     * filter-expression type comes from the same ORM-client internals
     * `.include` cannot be named from either.
     */
    readonly deleteExcept: (spaceId: string, keepIds: readonly string[]) => Promise<void>;
    /**
     * Delete every Thing `spaceId` owns. `#truncateHyperContent` (ADR 0094)
     * calls this over stored state it has never validated, so — like
     * `Space.deleteById` above — this must never decode `document`: on
     * SQLite, a root-level delete that returns the deleted rows decodes
     * `document` through the json codec on the way back (`readDocument`'s own
     * doc comment), which throws on a Thing whose stored text is not even
     * JSON, exactly the broken content truncation exists to remove without
     * reading. Each database module answers this through a count-only
     * delete instead.
     */
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
 *   SQLite's additionally carries what `Space.loadEvery` needs to
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
 *
 * Property syntax throughout, like `SqlTables` above and for the same reason
 * (ADR 0095): a method signature is checked bivariantly, which would loosen
 * what assignability proves for `Handle` and `Order` wherever they appear in
 * parameter position below.
 */
export interface SqlStore<Handle, Order> {
  readonly orm: Handle;
  readonly tables: (orm: Handle) => SqlTables<Order>;
  readonly transaction: <T>(fn: (orm: Handle) => Promise<T>) => Promise<T>;
  readonly readDocument: (value: unknown) => unknown;
  readonly isDuplicateKey: (error: unknown, table: string) => boolean;
  readonly serialise: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly close: () => Promise<void>;
}

/**
 * The plain CRUD member implementations both database modules ran
 * identically (ADR 0095): each is declared here once, over a structural
 * slice of the raw generated collection named for exactly the calls it
 * makes — property syntax, no optional field — so the same "assignable
 * without a cast" proof `SqlTables` itself rests on covers these too.
 * `buildSpaceTable`/`buildThingTable`/`buildRepositoryStateTable` below
 * assemble a whole `SqlTables<Order>` from these, and `src/prisma/sql-store.ts`
 * and `src/sqlite/sql-store.ts` each call one set of those three with their
 * own generated `Space`/`Thing`/`RepositoryState` — keeping only
 * `loadWithThings`, `loadEvery` and `deleteExcept`'s query-builder `.notIn(...)`
 * call local, passed in as the few remaining per-database closures. Those are
 * the members `SqlTables`'s own doc comment explains cannot cross this
 * boundary generically, or whose filter callback this module cannot name
 * without depending on the same ORM-client internals that block `.include`.
 */

/** What `Space.where({ id })` answers on either database. */
interface SpaceByIdQuery {
  readonly update: (patch: {
    readonly document?: JsonValue;
    readonly revision?: string;
    readonly exportedRevision?: string;
  }) => Promise<{ readonly revision: string } | null>;
  readonly deleteCount: () => Promise<number>;
}

interface SpaceWithId {
  readonly where: (filter: { readonly id: string }) => SpaceByIdQuery;
}

interface SpaceCreatable {
  readonly create: (input: {
    readonly id: string;
    readonly document: JsonValue;
    readonly revision: string;
  }) => Promise<unknown>;
}

interface SpaceIdListable {
  readonly select: (field: 'id') => {
    readonly all: () => PromiseLike<readonly { readonly id: string }[]>;
  };
}

/** What `Space.select('id', 'revision')` answers, for some database's own `Order`. */
interface SpaceRevisionListable<Order> {
  readonly select: (
    fieldA: 'id',
    fieldB: 'revision',
  ) => {
    readonly orderBy: (build: (space: { readonly id: { readonly asc: () => Order } }) => Order) => {
      readonly all: () => PromiseLike<readonly SqlSpaceRevisionRow[]>;
    };
  };
}

interface ThingCreatable {
  readonly create: (input: {
    readonly id: string;
    readonly spaceId: string;
    readonly document: JsonValue;
  }) => Promise<unknown>;
}

interface ThingUpsertable {
  readonly upsert: (input: {
    readonly create: {
      readonly id: string;
      readonly spaceId: string;
      readonly document: JsonValue;
    };
    readonly update: { readonly document: JsonValue };
  }) => Promise<{ readonly spaceId: string }>;
}

interface ThingDeletableForSpace {
  readonly where: (filter: { readonly spaceId: string }) => {
    readonly deleteCount: () => Promise<number>;
  };
}

interface RepositoryStateQuery {
  readonly first: () => Promise<{ readonly metaSpaceId: string } | null>;
  readonly update: (patch: {
    readonly metaSpaceId: string;
  }) => Promise<{ readonly metaSpaceId: string } | null>;
  readonly delete: () => Promise<unknown>;
}

interface RepositoryStateWithSingleton {
  readonly where: (filter: { readonly singletonId: 1 }) => RepositoryStateQuery;
  readonly create: (input: {
    readonly singletonId: 1;
    readonly metaSpaceId: string;
  }) => Promise<unknown>;
}

/** `SqlTables.Space.relock`'s own doc comment explains the placeholder `document`. */
export const relockSpace = async (space: SpaceWithId, id: string): Promise<string | undefined> => {
  const locked = await space.where({ id }).update({ document: toJsonValue({}) });
  return locked === null ? undefined : locked.revision;
};

export const createSpaceRow = async (
  space: SpaceCreatable,
  input: { readonly id: string; readonly document: unknown; readonly revision: string },
): Promise<void> => {
  await space.create({
    id: input.id,
    document: toJsonValue(input.document),
    revision: input.revision,
  });
};

export const listSpaceIds = async (space: SpaceIdListable): Promise<readonly string[]> => {
  const rows = await space.select('id').all();
  return rows.map((row) => row.id);
};

/** `SqlTables.Space.loadAllForReplacement`'s own doc comment explains why `document` is never selected. */
export const loadAllForReplacement = <Order>(
  space: SpaceRevisionListable<Order>,
): PromiseLike<readonly SqlSpaceRevisionRow[]> =>
  space
    .select('id', 'revision')
    .orderBy((row) => row.id.asc())
    .all();

/**
 * `deleteCount()` rather than `delete()`: the latter returns the deleted row,
 * decoded `document` included, and a truncation this answers for (ADR 0094)
 * deletes whatever is stored whether or not `document` parses — so this must
 * never decode it, the same requirement `deleteThingsExcept`/
 * `deleteThingsForSpace` below carry for Things.
 */
export const deleteSpaceById = async (space: SpaceWithId, id: string): Promise<boolean> => {
  const deleted = await space.where({ id }).deleteCount();
  return deleted > 0;
};

export const setExportedRevision = async (
  space: SpaceWithId,
  id: string,
  revision: string,
): Promise<boolean> => {
  const updated = await space.where({ id }).update({ exportedRevision: revision });
  return updated !== null;
};

/** `SqlTables.Space.writeDocumentUnderLock`'s own doc comment explains the row lock. */
export const writeDocumentUnderLock = async (
  space: SpaceWithId,
  id: string,
  document: unknown,
): Promise<string | undefined> => {
  const locked = await space.where({ id }).update({ document: toJsonValue(document) });
  return locked === null ? undefined : locked.revision;
};

export const setSpaceRevision = async (
  space: SpaceWithId,
  id: string,
  revision: string,
): Promise<void> => {
  await space.where({ id }).update({ revision });
};

export const createThingRow = async (
  thing: ThingCreatable,
  input: { readonly id: string; readonly spaceId: string; readonly document: unknown },
): Promise<void> => {
  await thing.create({
    id: input.id,
    spaceId: input.spaceId,
    document: toJsonValue(input.document),
  });
};

/** `SqlTables.Thing.upsert`'s own doc comment explains the ownership answer. */
export const upsertThingRow = async (
  thing: ThingUpsertable,
  input: { readonly id: string; readonly spaceId: string; readonly document: unknown },
): Promise<{ readonly spaceId: string }> => {
  const stored = await thing.upsert({
    create: { id: input.id, spaceId: input.spaceId, document: toJsonValue(input.document) },
    update: { document: toJsonValue(input.document) },
  });
  return { spaceId: stored.spaceId };
};

/**
 * `deleteCount()` rather than `deleteAll()`, for the same reason
 * `deleteSpaceById` above does: `#truncateHyperContent` calls this over
 * stored state it has not validated (ADR 0094), and `deleteAll()` returns the
 * deleted rows — decoded `document` included — which would decode exactly
 * the broken content truncation exists to remove without reading.
 */
export const deleteThingsForSpace = async (
  thing: ThingDeletableForSpace,
  spaceId: string,
): Promise<void> => {
  await thing.where({ spaceId }).deleteCount();
};

export const readRepositoryState = async (
  state: RepositoryStateWithSingleton,
): Promise<{ readonly metaSpaceId: string } | null> => {
  const row = await state.where({ singletonId: 1 }).first();
  return row === null ? null : { metaSpaceId: row.metaSpaceId };
};

export const relockRepositoryState = async (
  state: RepositoryStateWithSingleton,
  metaSpaceId: string,
): Promise<boolean> => {
  const locked = await state.where({ singletonId: 1 }).update({ metaSpaceId });
  return locked !== null;
};

export const createRepositoryState = async (
  state: RepositoryStateWithSingleton,
  metaSpaceId: string,
): Promise<void> => {
  await state.create({ singletonId: 1, metaSpaceId });
};

export const deleteRepositoryState = async (state: RepositoryStateWithSingleton): Promise<void> => {
  await state.where({ singletonId: 1 }).delete();
};

/**
 * `SqlTables<Order>['Space']`, assembled once from the CRUD functions above
 * plus the two closures each database module still composes for itself
 * (`loadWithThings`, `loadEvery` — `SqlTables`'s own doc comment explains
 * why). `space` is checked structurally against the intersection of every
 * CRUD function's own parameter type, the same "assignable without a cast"
 * proof each of those already rests on individually.
 */
export const buildSpaceTable = <Order>(
  space: SpaceWithId &
    SpaceCreatable &
    SpaceIdListable &
    SpaceRevisionListable<Order> &
    Orderable<Order>,
  loadWithThings: (id: string) => Promise<SqlLoadedSpaceRow | null>,
  loadEvery: () => PromiseLike<readonly SqlLoadedSpaceRow[]>,
): SqlTables<Order>['Space'] => ({
  orderBy: (build) => space.orderBy(build),
  loadWithThings,
  loadEvery,
  loadAllForReplacement: () => loadAllForReplacement(space),
  relock: (id) => relockSpace(space, id),
  create: (input) => createSpaceRow(space, input),
  listIds: () => listSpaceIds(space),
  deleteById: (id) => deleteSpaceById(space, id),
  setExportedRevision: (id, revision) => setExportedRevision(space, id, revision),
  writeDocumentUnderLock: (id, document) => writeDocumentUnderLock(space, id, document),
  setRevision: (id, revision) => setSpaceRevision(space, id, revision),
});

/**
 * `SqlTables<Order>['Thing']`, assembled once from the CRUD functions above
 * plus `deleteExcept`, the one member each database module still composes
 * for itself (`SqlTables`'s own doc comment explains why).
 */
export const buildThingTable = (
  thing: ThingCreatable & ThingUpsertable & ThingDeletableForSpace,
  deleteExcept: (spaceId: string, keepIds: readonly string[]) => Promise<void>,
): SqlTables<unknown>['Thing'] => ({
  create: (input) => createThingRow(thing, input),
  upsert: (input) => upsertThingRow(thing, input),
  deleteExcept,
  deleteAllForSpace: (spaceId) => deleteThingsForSpace(thing, spaceId),
});

/** `SqlTables<Order>['RepositoryState']`, assembled once from the CRUD functions above. */
export const buildRepositoryStateTable = (
  state: RepositoryStateWithSingleton,
): SqlTables<unknown>['RepositoryState'] => ({
  read: () => readRepositoryState(state),
  relock: (metaSpaceId) => relockRepositoryState(state, metaSpaceId),
  create: (metaSpaceId) => createRepositoryState(state, metaSpaceId),
  delete: () => deleteRepositoryState(state),
});

/**
 * The one member `SqlTables`'s doc comment says crosses the module boundary
 * structurally: `Space.orderBy(...).all()`. Both database modules probe
 * their own generated `Space` through this to name their own `Order`
 * (`src/prisma/sql-store.ts`, `src/sqlite/sql-store.ts`) — a generic identity
 * function rather than an assertion, so an accidental mismatch (a misspelled
 * column, a wrong revision type) fails to compile instead of being cast
 * away.
 */
export interface Orderable<Order> {
  readonly orderBy: (build: (space: { readonly id: { readonly asc: () => Order } }) => Order) => {
    readonly all: () => PromiseLike<readonly SqlSpaceListRow[]>;
  };
}

export const asOrderable = <Order>(space: Orderable<Order>): Orderable<Order> => space;

/**
 * `Handle`/`Order` are inferred from what is passed rather than written out,
 * so nothing here asserts a shape the object literal does not actually have.
 */
export const defineSqlStore = <Handle, Order>(
  store: SqlStore<Handle, Order>,
): SqlStore<Handle, Order> => store;
