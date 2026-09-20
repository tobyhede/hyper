import {
  spaceDocumentSchema,
  thingDocumentSchema,
  uuidSchema,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
import {
  AggregateInvariantError,
  commitRequestRefusal,
  committedRevision,
  decideCommit,
  decodeStoredRevision,
  encodeStoredRevision,
  RevisionCodecError,
  type AggregateLoadResult,
  type LoadedAggregate,
  type LoadedSpace,
  type RepositoryCommitResult,
  type SpaceChange,
  type SpaceCommit,
  type SpaceSummary,
} from '@project/persistence';
import { classifyInitializedAggregate } from './aggregate-lifecycle';
import type {
  AggregateInput,
  InitializeAggregateResult,
  ReplaceAggregateResult,
  SpaceRepository,
} from './space-repository';
import type { SqlStore, SqlTables } from './sql-store';

class SnapshotValidationError extends Error {}

class ThingOwnershipError extends Error {}

/**
 * A Space row moved between a conflict check and its write -- `replaceAggregate`'s
 * per-row re-lock, or `#writeUpdate`'s row-lock write on either commit path.
 *
 * Thrown rather than returned because the write loop has already replaced
 * earlier Spaces in the change set by the time it can be detected. Returning
 * a conflict from inside the transaction callback would commit those writes
 * beside it; escaping the callback is what rolls the whole change set back.
 */
class StaleSpaceRevisionError extends Error {
  readonly spaceId: UUID;

  constructor(spaceId: UUID) {
    super(`Space ${spaceId} changed during commit`);
    this.spaceId = spaceId;
  }
}

const parseSnapshot = (input: unknown): SpaceSnapshot => {
  const intake = loadSpaceSnapshot(input);
  if (!intake.ok) {
    throw new SnapshotValidationError(intake.errors.map(({ message }) => message).join('\n'));
  }
  return intake.snapshot;
};

const ascendingSnapshotId = (left: SpaceSnapshot, right: SpaceSnapshot): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

type UpdateChange = Extract<SpaceChange, { kind: 'update' }>;

/**
 * `decodeStoredRevision`/`encodeStoredRevision`, reclassified for the commit
 * path: a revision the codec refuses -- stored text that is not canonical
 * decimal, or a value past the 2^63-1 ceiling on either side of the round
 * trip -- is broken stored state (ADR 0095), the same identity
 * `#loadEverySpace`'s own decode step already raises it as. Three places
 * outside `#loadEverySpace`'s complete read decode or encode a Space's
 * revision during a commit -- `#writeUpdate`'s row-lock write and its prior-
 * revision comparison, and `#loadStoredSpaceRowForCommit`'s two callers, the
 * fast path's candidate read and the post-rollback conflict reload -- and all
 * three need the same reclassification rather than letting `RevisionCodecError`
 * escape a commit unclassified as a defect no retry cures answered
 * `persistence-unavailable`. Decode and encode are named separately below
 * because they are not the same claim: a decode failure is about a revision
 * the database already holds, an encode failure is about the next revision
 * the commit itself just computed and has not written anywhere yet.
 */
const storedRevisionInvariant = (spaceId: UUID, error: unknown): AggregateInvariantError =>
  new AggregateInvariantError(`Stored Space ${spaceId}'s revision is not usable`, { cause: error });

/**
 * `decodeStoredRevision`, reclassifying a `RevisionCodecError` it raises as
 * `storedRevisionInvariant` -- used for a value already sitting in the
 * `revision` column: `#writeUpdate`'s prior-revision comparison, and (through
 * `#loadStoredSpaceRow`) `#loadStoredSpaceRowForCommit`'s two callers.
 */
const decodeRevisionReclassified = (spaceId: UUID, value: string): bigint => {
  try {
    return decodeStoredRevision(value);
  } catch (error) {
    if (!(error instanceof RevisionCodecError)) throw error;
    throw storedRevisionInvariant(spaceId, error);
  }
};

/**
 * `encodeStoredRevision`, reclassifying a `RevisionCodecError` it raises as
 * `AggregateInvariantError` -- used only by `#writeUpdate`'s own next
 * revision, which is not stored state: it is the value this commit computed
 * and is about to write, so the message names the commit's own output rather
 * than `storedRevisionInvariant`'s claim that the database already held
 * something unusable.
 */
const encodeNextRevisionReclassified = (spaceId: UUID, value: bigint): string => {
  try {
    return encodeStoredRevision(value);
  } catch (error) {
    if (!(error instanceof RevisionCodecError)) throw error;
    throw new AggregateInvariantError(`Space ${spaceId}'s next revision is not usable`, {
      cause: error,
    });
  }
};

/**
 * `commit`'s fast path's own decision (ADR 0095), which may also hand the
 * commit to the complete-aggregate decision.
 */
type TopologyPreservingDecision =
  | { readonly kind: 'answer'; readonly result: RepositoryCommitResult }
  | { readonly kind: 'write'; readonly result: RepositoryCommitResult }
  | { readonly kind: 'aggregate-path' };

/**
 * Whether a proposed snapshot keeps the boundary the fast path is allowed to
 * skip a complete-aggregate read for: the same default Diagram, the same
 * Diagrams, the same Things by id and kind, and -- for a Space Thing -- the
 * same selection. Absorbed unchanged (ticket 24) from the now-deleted
 * `topology-preserving-update.ts`, which both SQL adapters imported one copy
 * of until this repository replaced them.
 */
const preservesSnapshotBoundary = (current: SpaceSnapshot, next: SpaceSnapshot): boolean => {
  if (current.document.defaultDiagram !== next.document.defaultDiagram) return false;
  if (
    JSON.stringify(current.document.diagrams ?? []) !== JSON.stringify(next.document.diagrams ?? [])
  ) {
    return false;
  }
  if (current.things.length !== next.things.length) return false;
  const currentById = new Map(current.things.map((thing) => [thing.id, thing]));
  return next.things.every((thing) => {
    const previous = currentById.get(thing.id);
    if (previous?.document.kind !== thing.document.kind) return false;
    if (thing.document.kind !== 'space' || previous.document.kind !== 'space') return true;
    return (
      previous.document.spaceId === thing.document.spaceId &&
      previous.document.diagram === thing.document.diagram &&
      previous.document.graph === thing.document.graph
    );
  });
};

/** The one update a fast-path candidate consists of, or `undefined` for any other change set. */
const topologyPreservingCandidate = (request: SpaceCommit): UpdateChange | undefined => {
  const [change] = request.changes;
  return request.changes.length === 1 && change.kind === 'update' ? change : undefined;
};

/**
 * Decide a single update against the stored Space it names. A snapshot that
 * fails intake, or one that moves the snapshot boundary -- structure,
 * membership, a Thing's kind, or a Space Thing's selection -- goes to the
 * complete-aggregate decision, which alone can say where in the aggregate a
 * refusal sits.
 *
 * It is an optimisation of `decideCommit` and never a second set of rules, so
 * it answers only what the complete-aggregate decision would answer the same
 * way -- a revision conflict, or a write that moves no snapshot boundary --
 * and hands everything else to that decision. `#commitTopologyPreservingUpdate`
 * runs this before `#lockMetaIdentity` is ever called, deliberately: the fast
 * path holds no singleton lock. A `write` it answers is then gated on one
 * unlocked existence read of the Meta identity, because without that identity
 * `decideCommit` would refuse every otherwise-writable update (ticket 29); an
 * `answer` or `aggregate-path` never reaches that read.
 */
const decideTopologyPreservingUpdate = (
  change: UpdateChange,
  current: LoadedSpace | undefined,
): TopologyPreservingDecision => {
  if (current?.revision !== change.expectedRevision) {
    return {
      kind: 'answer',
      result: { kind: 'conflict', conflicts: [{ spaceId: change.spaceId, current }] },
    };
  }
  if (!loadSpaceSnapshot(change.snapshot).ok) return { kind: 'aggregate-path' };
  if (!preservesSnapshotBoundary(current.snapshot, change.snapshot)) {
    return { kind: 'aggregate-path' };
  }
  return {
    kind: 'write',
    result: {
      kind: 'committed',
      revisions: [{ spaceId: change.spaceId, revision: committedRevision(change) }],
      deletedSpaceIds: [],
    },
  };
};

/**
 * The one SQL Space repository (ADR 0095), serving `listSpaces`, `loadSpace`
 * (ticket 22), the Meta lifecycle -- `loadAggregate`, `initializeAggregate`,
 * `loadMetaSpaceId`, `replaceAggregate` and `markExported` (ticket 23) -- and
 * `commit` (ticket 24) for both databases through a database's own `SqlStore`
 * (`src/prisma/sql-store.ts`, `src/sqlite/sql-store.ts`). `PostgresSpaceRepository`
 * and `SqliteSpaceRepository`, the two adapters this class replaces, are gone.
 *
 * `Handle` and `Order` come from the `SqlStore` passed to the constructor —
 * whichever database it was built for — so this class itself names no
 * database-specific type.
 */
export class SqlSpaceRepository<Handle, Order> implements SpaceRepository {
  readonly #store: SqlStore<Handle, Order>;

  constructor(store: SqlStore<Handle, Order>) {
    this.#store = store;
  }

  listSpaces(): Promise<readonly SpaceSummary[]> {
    return this.#store.serialise(async () => {
      const tables = this.#store.tables(this.#store.orm);
      const spaces = await tables.Space.orderBy((space) => space.id.asc()).all();

      return spaces.map((space) => ({
        id: uuidSchema.parse(space.id),
        title: spaceDocumentSchema.parse(this.#store.readDocument(space.document)).title,
      }));
    });
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return this.#store.serialise(() =>
      this.#loadStoredSpaceRow(this.#store.tables(this.#store.orm), id),
    );
  }

  /**
   * One Space and its Things, read through `tables` rather than through
   * `#store.orm`/`#store.serialise` directly -- so it runs equally well
   * inside a transaction's own `tables(handle)` (the fast path's candidate
   * read, `commit`'s write loop having nothing to read here) and outside one,
   * over `#store.tables(#store.orm)` (`loadSpace` above, and the post-conflict
   * reload `#commitUnserialised` makes after a rolled-back transaction).
   *
   * A failure to decode this one row -- a document that fails intake, or (like
   * `#loadEverySpace`'s own decode step) a stored revision the shared codec
   * refuses -- escapes unclassified rather than raising
   * `AggregateInvariantError`: `loadSpace` above answers for one Space, not the
   * aggregate, and keeps the narrower error deliberately (ticket 27, "one
   * Space failing intake is that resource's answer to give, not evidence the
   * aggregate cannot be read"). The fast path's candidate read and the
   * post-conflict reload call `#loadStoredSpaceRowForCommit` below instead,
   * which reclassifies a revision decode failure only -- a commit's own
   * correctness depends on reading the revision it is about to compare or
   * conflict on, where it does not equally depend on that Space's document.
   */
  async #loadStoredSpaceRow(tables: SqlTables<Order>, id: UUID): Promise<LoadedSpace | undefined> {
    const stored = await tables.Space.loadWithThings(id);
    if (stored === null) return undefined;

    const snapshot = parseSnapshot({
      id: stored.id,
      document: spaceDocumentSchema.parse(this.#store.readDocument(stored.document)),
      things: stored.things.map((thing) => ({
        id: thing.id,
        document: thingDocumentSchema.parse(this.#store.readDocument(thing.document)),
      })),
    });

    return {
      snapshot,
      revision: decodeStoredRevision(stored.revision),
      exportedRevision:
        stored.exportedRevision === null ? null : decodeStoredRevision(stored.exportedRevision),
    };
  }

  /**
   * `#loadStoredSpaceRow`, reclassifying a `RevisionCodecError` it raises as
   * `AggregateInvariantError` (`storedRevisionInvariant`) rather than letting
   * it escape a commit unclassified. Used by the two commit-path readers of
   * one stored Space's row that are not `loadSpace` itself: the fast path's
   * candidate read (`#commitTopologyPreservingUpdate`) and the post-rollback
   * conflict reload (`#commitUnserialised`). `#loadStoredSpaceRow` is left as
   * it is -- `loadSpace`/`listSpaces` share it and keep the narrower,
   * unclassified error deliberately -- so this wraps the call rather than
   * changing what it answers.
   */
  async #loadStoredSpaceRowForCommit(
    tables: SqlTables<Order>,
    id: UUID,
  ): Promise<LoadedSpace | undefined> {
    try {
      return await this.#loadStoredSpaceRow(tables, id);
    } catch (error) {
      if (!(error instanceof RevisionCodecError)) throw error;
      throw storedRevisionInvariant(id, error);
    }
  }

  loadAggregate(): Promise<AggregateLoadResult> {
    return this.#store.serialise(() => this.#loadAggregateUnserialised());
  }

  async initializeAggregate(input: AggregateInput): Promise<InitializeAggregateResult> {
    return this.#store.serialise(() => this.#initializeUnserialised(input));
  }

  loadMetaSpaceId(): Promise<UUID | undefined> {
    return this.#store.serialise(() => this.#loadMetaSpaceIdUnserialised());
  }

  async replaceAggregate(
    input: AggregateInput,
    expectedMetaSpaceId: UUID | undefined,
  ): Promise<ReplaceAggregateResult> {
    return this.#store.serialise(() => this.#replaceUnserialised(input, expectedMetaSpaceId));
  }

  /**
   * `revision` is a caller-supplied `bigint` -- unlike `#writeUpdate`'s own
   * next revision or a value the decode side reads back out of a stored
   * column, nothing here has read or written it against either database
   * before `encodeStoredRevision` runs, so a value the codec refuses is a bug
   * in the caller, not evidence of broken stored state. It is deliberately
   * left as the plain `RevisionCodecError` `encodeStoredRevision` raises,
   * unlike its siblings above: `AggregateInvariantError`'s own declaration
   * (`@project/persistence`'s `repository.ts`) ties it to the shared
   * `SpaceResourceRepository` seam -- `loadAggregate` and `commit`, the two
   * operations `@project/http` reaches -- and `markExported` sits only on the
   * wider `SpaceRepository` the CLI alone reaches (`export-aggregate.ts`'s
   * `markAggregateExported`, the only production caller), so no HTTP route
   * can ever classify this throw as 500 vs 503. That one caller already
   * catches every rejection through `Promise.allSettled` and reports each by
   * `.message` regardless of its class, so reclassifying it here would name
   * an identity nothing downstream asks for.
   */
  markExported(id: UUID, revision: bigint): Promise<void> {
    return this.#store.serialise(async () => {
      const tables = this.#store.tables(this.#store.orm);
      const updated = await tables.Space.setExportedRevision(id, encodeStoredRevision(revision));
      if (!updated) throw new Error(`Space ${id} does not exist`);
    });
  }

  commit(request: SpaceCommit): Promise<RepositoryCommitResult> {
    return this.#store.serialise(() => this.#commitUnserialised(request));
  }

  /**
   * Identity refusal first, then try the transaction: `commitRequestRefusal`
   * never touches the database, and the two classifications below only ever
   * apply to what `#commitInTransaction` throws after its own transaction has
   * already rolled back.
   */
  async #commitUnserialised(request: SpaceCommit): Promise<RepositoryCommitResult> {
    const refusal = commitRequestRefusal(request);
    if (refusal !== undefined) return refusal;

    try {
      return await this.#commitInTransaction(request);
    } catch (error) {
      // A Thing the commit writes is still owned by a Space the same commit
      // did not release. Complete intake cannot see it -- the candidate
      // aggregate is consistent and the collision only exists in the stored
      // rows the write loop meets in request order. It is permanent, so it
      // has to leave here as a rejection: escaping instead becomes 503
      // `persistence-unavailable`, which the client retries forever.
      if (error instanceof ThingOwnershipError) {
        return { kind: 'rejected', code: 'invalid-commit', message: error.message };
      }
      // The transaction has rolled back, so the current state is read fresh
      // outside it, through `#store.tables(#store.orm)` directly rather than
      // through the public, `serialise`-wrapped `loadSpace` -- this method is
      // itself already running inside `commit`'s own `serialise` call, and a
      // second one nested inside it would queue behind its own still-running
      // caller on SQLite and never resolve. Reading inside the aborted
      // transaction instead would answer with rows the caller can never
      // observe.
      if (error instanceof StaleSpaceRevisionError) {
        return {
          kind: 'conflict',
          conflicts: [
            {
              spaceId: error.spaceId,
              current: await this.#loadStoredSpaceRowForCommit(
                this.#store.tables(this.#store.orm),
                error.spaceId,
              ),
            },
          ],
        };
      }
      throw error;
    }
  }

  #commitInTransaction(request: SpaceCommit): Promise<RepositoryCommitResult> {
    return this.#store.transaction(async (handle) => {
      const tables = this.#store.tables(handle);
      const topologyPreserving = await this.#commitTopologyPreservingUpdate(tables, request);
      if (topologyPreserving !== undefined) return topologyPreserving;
      const metaSpaceId = await this.#lockMetaIdentity(tables);
      const decision = decideCommit(request, metaSpaceId, await this.#loadEverySpace(tables));
      if (decision.kind === 'answer') return decision.result;

      for (const change of request.changes) {
        if (change.kind === 'delete') {
          await tables.Thing.deleteAllForSpace(change.spaceId);
          const deleted = await tables.Space.deleteById(change.spaceId);
          if (!deleted) throw new Error(`Space ${change.spaceId} disappeared during commit`);
        } else if (change.kind === 'create') {
          await this.#createStoredSpace(tables, change.snapshot);
        } else {
          await this.#writeUpdate(
            tables,
            change.snapshot,
            change.expectedRevision,
            committedRevision(change),
          );
        }
      }
      return decision.result;
    });
  }

  /**
   * `commit`'s fast path (ADR 0095, absorbed from the now-deleted
   * `topology-preserving-update.ts`): a single update decided against the one
   * stored Space it names, never reading the complete aggregate.
   * `decideTopologyPreservingUpdate`'s own doc comment explains why this never
   * calls `#lockMetaIdentity`. The unlocked read below is a one-way eligibility
   * check inside this transaction: absence sends the candidate to the complete
   * decision, while presence grants no new write authority. It uses the same
   * transaction handle as the candidate read, which matters on SQLite: opening
   * a separate runtime here can contend with the transaction it is deciding.
   *
   * It is read last, gating only the `write` branch, because that is the only
   * branch the identity bears on: a conflict and a boundary-moving snapshot
   * are both answered without it, `#lockMetaIdentity`'s own doc comment saying
   * revision conflicts are answerable with no Meta Space at all. So a stale
   * revision -- the case the fast path exists to make cheap -- costs the same
   * statements it did before ticket 29.
   */
  async #commitTopologyPreservingUpdate(
    tables: SqlTables<Order>,
    request: SpaceCommit,
  ): Promise<RepositoryCommitResult | undefined> {
    const change = topologyPreservingCandidate(request);
    if (change === undefined) return undefined;
    const decision = decideTopologyPreservingUpdate(
      change,
      await this.#loadStoredSpaceRowForCommit(tables, change.spaceId),
    );
    if (decision.kind === 'aggregate-path') return undefined;
    if (decision.kind === 'answer') return decision.result;
    if ((await tables.RepositoryState.read()) === null) return undefined;

    // Past this point the snapshot boundary is settled and this path commits,
    // so the write below is the first one and every earlier return has
    // written nothing.
    await this.#writeUpdate(
      tables,
      change.snapshot,
      change.expectedRevision,
      committedRevision(change),
    );
    return decision.result;
  }

  /**
   * The one helper both commit paths write an update through (ADR 0095,
   * ticket 24), keeping the statement order the two adapters this repository
   * replaced always kept: write the document to take the row lock and answer
   * the revision the row carried when that lock was granted, compare it
   * against `expectedRevision`, then write the new revision, then the
   * Things, then delete the Things the snapshot dropped -- which removes
   * nothing on the fast path, whose own `preservesSnapshotBoundary` never
   * lets a changed Thing membership reach here. A single `UPDATE` that set
   * the revision would return the value it just wrote rather than the one it
   * replaced, which is why the document and the revision stay two separate
   * writes rather than one.
   *
   * The revision is re-established under the row lock rather than trusted
   * from an earlier read: the fast path deliberately holds no singleton lock,
   * so another commit -- fast or slow -- can move the row in between, and the
   * conflict this then throws rolls the whole transaction back.
   */
  async #writeUpdate(
    tables: SqlTables<Order>,
    snapshot: SpaceSnapshot,
    expectedRevision: bigint,
    newRevision: bigint,
  ): Promise<void> {
    const priorRevision = await tables.Space.writeDocumentUnderLock(snapshot.id, snapshot.document);
    if (
      priorRevision === undefined ||
      decodeRevisionReclassified(snapshot.id, priorRevision) !== expectedRevision
    ) {
      throw new StaleSpaceRevisionError(snapshot.id);
    }
    await tables.Space.setRevision(
      snapshot.id,
      encodeNextRevisionReclassified(snapshot.id, newRevision),
    );
    await this.#upsertThings(tables, snapshot);
    await tables.Thing.deleteExcept(
      snapshot.id,
      snapshot.things.map((thing) => thing.id),
    );
  }

  /**
   * `commit`'s own Thing write for an `update` change -- distinct from
   * `#importThings`, which `create` uses and which throws on a losing insert.
   * An update's row already exists, so ownership is read back off the upsert
   * instead (`SqlTables.Thing.upsert`'s own doc comment).
   */
  async #upsertThings(tables: SqlTables<Order>, snapshot: SpaceSnapshot): Promise<void> {
    for (const thing of snapshot.things) {
      const stored = await tables.Thing.upsert({
        id: thing.id,
        spaceId: snapshot.id,
        document: thing.document,
      });
      if (stored.spaceId !== snapshot.id) {
        throw new ThingOwnershipError(
          `Thing ${thing.id} belongs to space ${stored.spaceId}, not ${snapshot.id}`,
        );
      }
    }
  }

  /**
   * Take the singleton row's write lock, and answer `undefined` when there is
   * no row to take.
   *
   * A repository that has only been migrated has no Meta Space, and there is
   * then nothing to serialize integrity-affecting transactions on and no
   * aggregate to validate. That is not a reason to fail a commit outright:
   * identity and revision conflicts are answerable without Meta, and
   * `MemorySpaceRepository` answers them first.
   *
   * The self-update can find the row gone: a concurrent replacement deleted
   * and rewrote it between the read above and this update. A second, final
   * attempt re-reads and re-locks once for exactly that case, and answers
   * with **the identity the retry itself locks** -- the one now actually
   * stored -- never the one the first attempt read before the replacement.
   * Ticket 23's race test on the (then two-adapter) PostgreSQL repository
   * settled this (`test/integration/postgres-space-repository.test.ts`,
   * "conflicts a replacement authorized against an identity a concurrent
   * replacement retired" and "judges a complete-aggregate commit against an
   * identity a concurrent replacement retired"): answering with the
   * pre-replacement identity lets a stale `replaceAggregate` caller's
   * expected identity match it and silently overwrite the concurrent
   * replacement, and lets a commit's `decideCommit` validate the *current*
   * stored Spaces against an identity no longer among them, refusing a valid
   * aggregate as broken. Two attempts, as a bounded loop rather than
   * recursion on a boolean retry flag, so the "one retry, then give up" shape
   * reads directly off the loop bound instead of off an argument only this
   * method's own second call site ever passes.
   */
  async #lockMetaIdentity(tables: SqlTables<Order>): Promise<UUID | undefined> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const state = await tables.RepositoryState.read();
      if (state === null) return undefined;
      const metaSpaceId = uuidSchema.parse(state.metaSpaceId);
      const stillPresent = await tables.RepositoryState.relock(metaSpaceId);
      if (stillPresent) return metaSpaceId;
    }
    throw new Error('Repository state disappeared while locking it');
  }

  /**
   * Every stored Space, parsed.
   *
   * A row that fails intake or a revision that fails the shared codec raises
   * `AggregateInvariantError` rather than the private `SnapshotValidationError`
   * a bare `parseSnapshot` would, the codec's own `RevisionCodecError`, or (on
   * SQLite, whose stored document may not even be JSON) a `SyntaxError` from
   * `readDocument`'s `JSON.parse`. All are stored state no aggregate can be
   * read from, and every caller of this method is an aggregate-level read
   * whose failure a reader classifies (`docs/agents/editing-and-persistence.md`).
   * Nothing inside the `try` performs I/O -- `tables.Space.loadEvery()` above
   * already has, on both databases -- so the catch below is unconditional, by
   * position rather than by type: a connection failure cannot reach it, and
   * narrowing to today's three known causes would answer a fourth, future
   * decode failure as *unclassified* instead -- exactly the "unavailable,
   * retry forever" misclassification this error class exists to prevent,
   * just failing quietly rather than loudly (ticket 27, "The per-row catch
   * is unconditional, by position rather than by type", declined narrowing
   * this same shape on this same reasoning).
   *
   * `loadSpace`/`listSpaces` keep the narrower, unclassified error
   * deliberately: one Space failing intake is that resource's answer to give,
   * not evidence the aggregate cannot be read.
   */
  async #loadEverySpace(tables: SqlTables<Order>): Promise<readonly LoadedSpace[]> {
    const stored = await tables.Space.loadEvery();

    return stored.map((space) => {
      try {
        return {
          snapshot: parseSnapshot({
            id: space.id,
            document: this.#store.readDocument(space.document),
            things: space.things.map((thing) => ({
              id: thing.id,
              document: this.#store.readDocument(thing.document),
            })),
          }),
          revision: decodeStoredRevision(space.revision),
          exportedRevision:
            space.exportedRevision === null ? null : decodeStoredRevision(space.exportedRevision),
        };
      } catch (error) {
        throw new AggregateInvariantError(`Stored Space ${space.id} does not parse`, {
          cause: error,
        });
      }
    });
  }

  async #authoritativeAggregate(
    tables: SqlTables<Order>,
    metaSpaceId: UUID,
  ): Promise<LoadedAggregate> {
    const spaces = await this.#loadEverySpace(tables);
    const intake = loadSpaceAggregate({
      metaSpaceId,
      snapshots: spaces.map(({ snapshot }) => snapshot),
    });
    if (!intake.ok) throw new AggregateInvariantError('Stored aggregate violates Meta invariants');
    return { metaSpaceId, spaces };
  }

  async #importThings(tables: SqlTables<Order>, snapshot: SpaceSnapshot): Promise<void> {
    for (const thing of snapshot.things) {
      try {
        await tables.Thing.create({ id: thing.id, spaceId: snapshot.id, document: thing.document });
      } catch (error) {
        if (this.#store.isDuplicateKey(error, 'things')) {
          throw new ThingOwnershipError(`Thing ${thing.id} already belongs to another space`);
        }
        throw error;
      }
    }
  }

  async #createStoredSpace(tables: SqlTables<Order>, snapshot: SpaceSnapshot): Promise<void> {
    await tables.Space.create({
      id: snapshot.id,
      document: snapshot.document,
      revision: encodeStoredRevision(0n),
    });
    await this.#importThings(tables, snapshot);
  }

  async #truncateHyperContent(tables: SqlTables<Order>): Promise<void> {
    // Repository state restricts deletion of its Meta Space, so clear the
    // Meta identity row before deleting any Space rows.
    await tables.RepositoryState.delete();
    for (const id of await tables.Space.listIds()) {
      await tables.Thing.deleteAllForSpace(id);
      await tables.Space.deleteById(id);
    }
  }

  async #replaceAllSpaces(
    tables: SqlTables<Order>,
    input: AggregateInput,
  ): Promise<LoadedAggregate> {
    await this.#truncateHyperContent(tables);
    for (const snapshot of [...input.spaces].sort(ascendingSnapshotId)) {
      await this.#createStoredSpace(tables, snapshot);
    }
    await tables.RepositoryState.create(input.metaSpaceId);
    return this.#authoritativeAggregate(tables, input.metaSpaceId);
  }

  async #loadAggregateUnserialised(): Promise<AggregateLoadResult> {
    return this.#store.transaction(async (handle) => {
      const tables = this.#store.tables(handle);
      const metaSpaceId = await this.#lockMetaIdentity(tables);
      if (metaSpaceId === undefined) {
        if ((await this.#loadEverySpace(tables)).length === 0) return { kind: 'uninitialized' };
        throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
      }
      return { kind: 'loaded', aggregate: await this.#authoritativeAggregate(tables, metaSpaceId) };
    });
  }

  async #loadMetaSpaceIdUnserialised(): Promise<UUID | undefined> {
    const tables = this.#store.tables(this.#store.orm);
    const state = await tables.RepositoryState.read();
    return state === null ? undefined : uuidSchema.parse(state.metaSpaceId);
  }

  async #initializeUnserialised(input: AggregateInput): Promise<InitializeAggregateResult> {
    const intake = loadSpaceAggregate({
      metaSpaceId: input.metaSpaceId,
      snapshots: input.spaces,
    });
    if (!intake.ok) return { kind: 'aggregate-refused', errors: intake.errors };
    try {
      return await this.#store.transaction(async (handle) => {
        const tables = this.#store.tables(handle);
        const metaSpaceId = await this.#lockMetaIdentity(tables);
        if (metaSpaceId !== undefined) {
          return classifyInitializedAggregate(
            input,
            await this.#authoritativeAggregate(tables, metaSpaceId),
          );
        }
        if ((await this.#loadEverySpace(tables)).length > 0) {
          throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
        }
        return { kind: 'initialized', aggregate: await this.#replaceAllSpaces(tables, input) };
      });
    } catch (error) {
      // Identical and different first proposals race on the first durable
      // Space identity. The loser reads the winner after its transaction
      // rolls back and classifies authored meaning, rather than exposing SQL
      // timing.
      if (
        !(error instanceof ThingOwnershipError) &&
        !this.#store.isDuplicateKey(error, 'spaces') &&
        !this.#store.isDuplicateKey(error, 'repository_state')
      ) {
        throw error;
      }
      const result = await this.#loadAggregateUnserialised();
      if (result.kind === 'uninitialized') throw error;
      return classifyInitializedAggregate(input, result.aggregate);
    }
  }

  async #replaceUnserialised(
    input: AggregateInput,
    expectedMetaSpaceId: UUID | undefined,
  ): Promise<ReplaceAggregateResult> {
    const intake = loadSpaceAggregate({
      metaSpaceId: input.metaSpaceId,
      snapshots: input.spaces,
    });
    if (!intake.ok) return { kind: 'aggregate-refused', errors: intake.errors };
    try {
      return await this.#store.transaction(async (handle) => {
        const tables = this.#store.tables(handle);
        const metaSpaceId = await this.#lockMetaIdentity(tables);
        // Rows are read raw rather than through `#loadEverySpace`: truncation
        // replaces stored state whether or not it parses (ADR 0094). In id
        // order, so two overlapping replacements take the row locks below in
        // the same order: the later waits on the earlier rather than
        // deadlocking with it. Where no Meta row exists to lock, those row
        // locks are all that serialises them.
        const storedRows = await tables.Space.loadAllForReplacement();
        if (metaSpaceId === undefined && storedRows.length === 0) {
          return { kind: 'uninitialized' };
        }
        if (metaSpaceId !== expectedMetaSpaceId) {
          return { kind: 'conflict', currentMetaSpaceId: metaSpaceId };
        }
        // The baseline read is lock-free so topology-preserving commits
        // retain their fast path. Re-lock each row and compare its revision
        // again -- a row that does not parse locks too, since `relock` never
        // reads `document` -- so a commit that won in between must conflict
        // rather than be overwritten.
        for (const row of storedRows) {
          const currentRevision = await tables.Space.relock(row.id);
          if (currentRevision === undefined || currentRevision !== row.revision) {
            throw new StaleSpaceRevisionError(uuidSchema.parse(row.id));
          }
        }
        return { kind: 'replaced', aggregate: await this.#replaceAllSpaces(tables, input) };
      });
    } catch (error) {
      if (!(error instanceof StaleSpaceRevisionError)) throw error;
      // A stored Space moved, not necessarily the Meta identity, so this id is
      // usually the one the caller expected. The CLI words the conflict to
      // hold either way (`test/unit/hyper-cli.test.ts`, "does not claim the
      // Meta identity moved ...").
      return { kind: 'conflict', currentMetaSpaceId: await this.#loadMetaSpaceIdUnserialised() };
    }
  }
}
