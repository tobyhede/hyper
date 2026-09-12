import {
  thingDocumentSchema,
  spaceDocumentSchema,
  uuidSchema,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
import {
  AggregateInvariantError,
  type AggregateLoadResult,
  type LoadedAggregate,
  type LoadedSpace,
  type RepositoryCommitResult,
  type SpaceCommit,
  type SpaceConflict,
  type SpaceSummary,
} from '@project/persistence';
import { db } from '../prisma/db';
import { classifyInitializedAggregate } from './aggregate-lifecycle';
import type {
  AggregateInput,
  InitializeAggregateResult,
  ReplaceAggregateResult,
  SpaceRepository,
} from './space-repository';

type Orm = typeof db.orm;
type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

class SnapshotValidationError extends Error {}

class ThingOwnershipError extends Error {}

/**
 * A Space row moved between this transaction's conflict check and its write.
 *
 * Thrown rather than returned because the write loop has already replaced
 * earlier Spaces in the change set by the time it can be detected. Returning a
 * conflict from inside the transaction callback would commit those writes
 * beside it, publishing half a coordinated edit; escaping the callback is what
 * rolls the whole change set back. `ThingOwnershipError` above escapes for the
 * same reason.
 */
class StaleSpaceRevisionError extends Error {
  readonly spaceId: UUID;

  constructor(spaceId: UUID) {
    super(`Space ${spaceId} changed during commit`);
    this.spaceId = spaceId;
  }
}

interface SqlPrimaryKeyConflictFields {
  readonly kind?: unknown;
  readonly sqlState?: unknown;
  readonly table?: unknown;
  readonly constraint?: unknown;
}

const isPrimaryKeyConflict = (
  error: unknown,
  table: string,
  constraint: string,
): error is SqlPrimaryKeyConflictFields => {
  if (typeof error !== 'object' || error === null) return false;
  // SAFETY: checked above — error is a non-null object, so probing named
  // fields on it (each still typed unknown until compared) cannot throw.
  const candidate = error as SqlPrimaryKeyConflictFields;
  return (
    candidate.kind === 'sql_query' &&
    candidate.sqlState === '23505' &&
    candidate.table === table &&
    candidate.constraint === constraint
  );
};

const isSpacePrimaryKeyConflict = (error: unknown): error is SqlPrimaryKeyConflictFields =>
  isPrimaryKeyConflict(error, 'spaces', 'spaces_pkey');

const isThingPrimaryKeyConflict = (error: unknown): error is SqlPrimaryKeyConflictFields =>
  isPrimaryKeyConflict(error, 'things', 'things_pkey');

const isRepositoryStatePrimaryKeyConflict = (
  error: unknown,
): error is SqlPrimaryKeyConflictFields =>
  isPrimaryKeyConflict(error, 'repository_state', 'repository_state_pkey');

const toRevision = (value: number | string | bigint): bigint => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(`Database revision ${value} is not a safe integer`);
  }
  return typeof value === 'bigint' ? value : BigInt(value);
};

const toOptionalRevision = (value: number | string | bigint | null): bigint | null =>
  value === null ? null : toRevision(value);

/**
 * SAFETY: Prisma Next 0.16.0 declares `int8` inputs as `number`, although its
 * codec passes values through unchanged at runtime and node-postgres accepts
 * bigint parameters directly — this relabels the type without converting the
 * value, so no precision is lost the way a real `Number(value)` call could
 * lose it above `Number.MAX_SAFE_INTEGER`. `bigint` and `number` have no
 * direct assertion path in TypeScript, hence the `unknown` bridge. Keep the
 * upstream type workaround isolated here so revisions are never narrowed.
 */
const toDatabaseRevision = (value: bigint): number => value as unknown as number;

const toJsonValue = (value: unknown): JsonValue => {
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

const parseSnapshot = (input: unknown): SpaceSnapshot => {
  const intake = loadSpaceSnapshot(input);
  if (!intake.ok) {
    throw new SnapshotValidationError(intake.errors.map(({ message }) => message).join('\n'));
  }

  return intake.snapshot;
};

/**
 * One stored Space and its Things — a **snapshot**, not the aggregate (ADR
 * 0088). `@project/graph`'s `loadSpaceAggregate`, imported above under its own
 * name, is the collection one; this reads a single row and its children.
 *
 * One statement, so one snapshot: PostgreSQL fixes it at statement start, and
 * `include` compiles the child rows into a correlated subquery rather than a
 * second round trip. Other transactions still commit while this runs — they are
 * simply not in the snapshot it reads from, so the document and its things
 * cannot come from either side of one. There is no torn read to detect and no
 * revision comparison to make.
 */
const loadStoredSpace = async (orm: Orm, id: UUID): Promise<LoadedSpace | undefined> => {
  const stored = await orm.public.Space.where({ id })
    .include('things', (things) =>
      things.select('id', 'document').orderBy((thing) => thing.id.asc()),
    )
    .first();
  if (stored === null) return undefined;

  const snapshot = parseSnapshot({
    id: stored.id,
    document: spaceDocumentSchema.parse(stored.document),
    things: stored.things.map((thing) => ({
      id: thing.id,
      document: thingDocumentSchema.parse(thing.document),
    })),
  });

  return {
    snapshot,
    revision: toRevision(stored.revision),
    exportedRevision: toOptionalRevision(stored.exportedRevision),
  };
};

/**
 * Every stored Space, parsed.
 *
 * A row that fails intake raises `AggregateInvariantError` rather than the
 * private `SnapshotValidationError` a bare `parseSnapshot` would. Both are
 * stored state no aggregate can be read from, and every caller of this function
 * is an aggregate-level read whose failure a reader classifies: unconverted, a
 * corrupt document reaches `src/http/space-host.ts` as an unreachable database
 * and is answered `try again later` for a defect no later attempt cures, while
 * start-up spends its whole retry budget on it. The original travels on `cause`,
 * so the located intake prose is still there for an operator.
 *
 * `loadSpace` keeps the narrower error deliberately. One Space failing intake is
 * that resource's answer to give, not evidence the aggregate cannot be read.
 */
const loadEverySpace = async (orm: Orm): Promise<readonly LoadedSpace[]> => {
  const stored = await orm.public.Space.orderBy((space) => space.id.asc())
    .include('things', (things) =>
      things.select('id', 'document').orderBy((thing) => thing.id.asc()),
    )
    .all();

  return stored.map((space) => {
    try {
      return {
        snapshot: parseSnapshot({
          id: space.id,
          document: space.document,
          things: space.things.map((thing) => ({ id: thing.id, document: thing.document })),
        }),
        revision: toRevision(space.revision),
        exportedRevision: toOptionalRevision(space.exportedRevision),
      };
    } catch (error) {
      if (!(error instanceof SnapshotValidationError)) throw error;
      throw new AggregateInvariantError(`Stored Space ${space.id} does not parse`, {
        cause: error,
      });
    }
  });
};

/**
 * Take the singleton row's write lock, and answer `undefined` when there is no
 * row to take.
 *
 * A repository that has only been migrated has no Meta Space, and there is then
 * nothing to serialize integrity-affecting transactions on and no aggregate to
 * validate. That is not a reason to fail a commit outright: identity and
 * revision conflicts are answerable without Meta, and `MemorySpaceRepository`
 * answers them first. Requiring Meta here instead made a commit against an
 * unbootstrapped database throw, which the HTTP host reports as a retryable
 * 503.
 */
const lockMetaIdentity = async (
  orm: Orm,
  retryAfterReplacement = true,
): Promise<UUID | undefined> => {
  const state = await orm.public.RepositoryState.where({ singletonId: 1 }).first();
  if (state === null) return undefined;
  const metaSpaceId = uuidSchema.parse(state.metaSpaceId);
  const locked = await orm.public.RepositoryState.where({ singletonId: 1 }).update({ metaSpaceId });
  if (locked === null) {
    if (retryAfterReplacement) {
      const replacementMetaSpaceId = await lockMetaIdentity(orm, false);
      if (replacementMetaSpaceId !== undefined) return metaSpaceId;
    }
    throw new Error('Repository state disappeared while locking it');
  }
  return metaSpaceId;
};

/**
 * Write one Space's document under the row's write lock, and answer the
 * revision the row actually carried when that lock was granted. `undefined`
 * means there is no such row.
 *
 * This exists because a revision predicate on the ORM's own `update` does not
 * do it. `where({ id, revision }).update(...)` compiles to a SELECT that tests
 * the predicate followed by an `UPDATE ... WHERE id = $1` keyed on the primary
 * key alone, so the revision is checked against a snapshot the write never
 * rechecks. Two commits that read the same revision both matched and both
 * wrote, the later silently replacing the earlier, and both callers were told
 * they had committed — the check read as atomic and was not.
 *
 * Writing the document first is what closes that window. The UPDATE takes the
 * row's write lock, and because it leaves `revision` alone, the row it returns
 * carries the authoritative committed revision as of the moment the lock was
 * granted — a concurrent writer has either finished before it, and is visible
 * here, or is still waiting for the lock this now holds to the end of the
 * transaction. So the caller's comparison against it cannot go stale, and the
 * revision it then writes cannot land on a row that moved.
 *
 * The document write on the losing path is rolled back with the rest of the
 * transaction, which is why every caller answers a mismatch by throwing rather
 * than returning.
 */
const writeSpaceDocumentUnderLock = async (
  orm: Orm,
  snapshot: SpaceSnapshot,
): Promise<bigint | undefined> => {
  const locked = await orm.public.Space.where({ id: snapshot.id }).update({
    document: toJsonValue(snapshot.document),
  });
  return locked === null ? undefined : toRevision(locked.revision);
};

/**
 * Replace one Space's stored rows, at the revision the conflict check read.
 *
 * The check above this is not enough on its own: it reads through
 * `loadEverySpace`, which takes no row locks, and the topology-preserving path
 * commits *without* ever taking the singleton lock this path holds — so a
 * single-Space edit can move a row in the window between the two.
 *
 * A row that is no longer there is the same answer as one that moved. Both mean
 * the change set was written against state that is no longer current, and both
 * are resolved by reloading — so neither is the `disappeared during commit`
 * invariant failure this used to raise.
 */
const replaceStoredSpace = async (
  orm: Orm,
  snapshot: SpaceSnapshot,
  expectedRevision: bigint,
  revision: bigint,
): Promise<void> => {
  const locked = await writeSpaceDocumentUnderLock(orm, snapshot);
  if (locked !== expectedRevision) throw new StaleSpaceRevisionError(snapshot.id);
  await orm.public.Space.where({ id: snapshot.id }).update({
    revision: toDatabaseRevision(revision),
  });
  await upsertThings(orm, snapshot);
  const ownedThings = orm.public.Thing.where({ spaceId: snapshot.id });
  if (snapshot.things.length === 0) await ownedThings.deleteAll();
  else {
    await ownedThings
      .where((thing) => thing.id.notIn(snapshot.things.map(({ id }) => id)))
      .deleteAll();
  }
};

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

const commitTopologyPreservingUpdate = async (
  orm: Orm,
  request: SpaceCommit,
): Promise<RepositoryCommitResult | undefined> => {
  const [change] = request.changes;
  if (request.changes.length !== 1 || change.kind !== 'update') return undefined;
  const current = await loadStoredSpace(orm, change.spaceId);
  if (current?.revision !== change.expectedRevision) {
    return { kind: 'conflict', conflicts: [{ spaceId: change.spaceId, current }] };
  }
  const intake = loadSpaceSnapshot(change.snapshot);
  if (!intake.ok) {
    return {
      kind: 'aggregate-refused',
      errors: [{ kind: 'invalid-space-snapshot', snapshotIndex: 0, errors: intake.errors }],
    };
  }
  if (!preservesSnapshotBoundary(current.snapshot, change.snapshot)) return undefined;

  // Past this point the snapshot boundary is settled and this path commits, so
  // the write below is the first one and every earlier return has written
  // nothing. The revision is re-established under the row lock rather than
  // trusted from the read above, because this path deliberately holds no
  // singleton lock: another commit — fast or slow — can move the row in
  // between, and the conflict it then raises rolls this transaction back.
  const revision = change.expectedRevision + 1n;
  const locked = await writeSpaceDocumentUnderLock(orm, change.snapshot);
  if (locked !== change.expectedRevision) throw new StaleSpaceRevisionError(change.spaceId);
  await orm.public.Space.where({ id: change.spaceId }).update({
    revision: toDatabaseRevision(revision),
  });
  await upsertThings(orm, change.snapshot);
  return {
    kind: 'committed',
    revisions: [{ spaceId: change.spaceId, revision }],
    deletedSpaceIds: [],
  };
};

const createStoredSpace = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  await orm.public.Space.create({
    id: snapshot.id,
    document: toJsonValue(snapshot.document),
    revision: 0,
  });
  await importThings(orm, snapshot);
};

const commitIdentityRefusal = (request: SpaceCommit): string | undefined => {
  const ids = new Set<UUID>();
  for (const change of request.changes) {
    if (ids.has(change.spaceId)) return `Space ${change.spaceId} is named more than once`;
    ids.add(change.spaceId);
    if (change.kind !== 'delete' && change.snapshot.id !== change.spaceId) {
      return `Change Space id ${change.spaceId} does not match its snapshot`;
    }
  }
  return undefined;
};

const upsertThings = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  for (const thing of snapshot.things) {
    const stored = await orm.public.Thing.upsert({
      create: {
        id: thing.id,
        spaceId: snapshot.id,
        document: toJsonValue(thing.document),
      },
      update: {
        document: toJsonValue(thing.document),
      },
    });
    if (stored.spaceId !== snapshot.id) {
      throw new ThingOwnershipError(
        `Thing ${thing.id} belongs to space ${stored.spaceId}, not ${snapshot.id}`,
      );
    }
  }
};

const importThings = async (orm: Orm, snapshot: SpaceSnapshot): Promise<void> => {
  for (const thing of snapshot.things) {
    try {
      await orm.public.Thing.create({
        id: thing.id,
        spaceId: snapshot.id,
        document: toJsonValue(thing.document),
      });
    } catch (error) {
      if (isThingPrimaryKeyConflict(error)) {
        throw new ThingOwnershipError(`Thing ${thing.id} already belongs to another space`);
      }
      throw error;
    }
  }
};

const truncateHyperContent = async (orm: Orm): Promise<void> => {
  // Repository state restricts deletion of its Meta Space, so clear the Meta
  // identity row before deleting any Space rows.
  await orm.public.RepositoryState.where({ singletonId: 1 }).delete();
  const spaces = await orm.public.Space.all();
  for (const space of spaces) {
    await orm.public.Thing.where({ spaceId: space.id }).deleteAll();
    await orm.public.Space.where({ id: space.id }).delete();
  }
};

const authoritativeAggregate = async (orm: Orm, metaSpaceId: UUID): Promise<LoadedAggregate> => {
  const spaces = await loadEverySpace(orm);
  const intake = loadSpaceAggregate({
    metaSpaceId,
    snapshots: spaces.map(({ snapshot }) => snapshot),
  });
  if (!intake.ok) throw new AggregateInvariantError('Stored aggregate violates Meta invariants');
  return { metaSpaceId, spaces };
};

const ascendingSnapshotId = (left: SpaceSnapshot, right: SpaceSnapshot): number => {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
};

const replaceAllSpaces = async (orm: Orm, input: AggregateInput): Promise<LoadedAggregate> => {
  await truncateHyperContent(orm);
  for (const snapshot of [...input.spaces].sort(ascendingSnapshotId)) {
    await createStoredSpace(orm, snapshot);
  }
  await orm.public.RepositoryState.create({ singletonId: 1, metaSpaceId: input.metaSpaceId });
  return authoritativeAggregate(orm, input.metaSpaceId);
};

/**
 * Establish Meta state when the repository has none, and leave it alone
 * otherwise.
 *
 * The singleton row is what `commit` and `loadAggregate` lock and read, and the
 * migration deliberately creates the table empty — a migration has no Space to
 * name. So a write path is what establishes it, and `initializeAggregate` is
 * the only one: ADR 0078 leaves exactly two lifecycle doors, and the other,
 * `replaceAggregate`, refuses a repository that has no Meta identity to
 * replace. Nothing establishes it as a side effect of storing a Space.
 */
export class PostgresSpaceRepository implements SpaceRepository {
  readonly #database: typeof db;

  constructor(database: typeof db = db) {
    this.#database = database;
  }

  async listSpaces(): Promise<readonly SpaceSummary[]> {
    const spaces = await this.#database.orm.public.Space.orderBy((space) => space.id.asc()).all();

    return spaces.map((space) => ({
      id: uuidSchema.parse(space.id),
      title: spaceDocumentSchema.parse(space.document).title,
    }));
  }

  loadSpace(id: UUID): Promise<LoadedSpace | undefined> {
    return loadStoredSpace(this.#database.orm, id);
  }

  loadAggregate(): Promise<AggregateLoadResult> {
    return this.#database.transaction(async ({ orm }) => {
      const metaSpaceId = await lockMetaIdentity(orm);
      if (metaSpaceId === undefined) {
        if ((await loadEverySpace(orm)).length === 0) return { kind: 'uninitialized' };
        throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
      }
      return { kind: 'loaded', aggregate: await authoritativeAggregate(orm, metaSpaceId) };
    });
  }

  async initializeAggregate(input: AggregateInput): Promise<InitializeAggregateResult> {
    const intake = loadSpaceAggregate({
      metaSpaceId: input.metaSpaceId,
      snapshots: input.spaces,
    });
    if (!intake.ok) return { kind: 'aggregate-refused', errors: intake.errors };
    try {
      return await this.#database.transaction(async ({ orm }) => {
        const metaSpaceId = await lockMetaIdentity(orm);
        if (metaSpaceId !== undefined) {
          return classifyInitializedAggregate(
            input,
            await authoritativeAggregate(orm, metaSpaceId),
          );
        }
        if ((await loadEverySpace(orm)).length > 0) {
          throw new AggregateInvariantError('Stored Spaces exist without a Meta Space');
        }
        return { kind: 'initialized', aggregate: await replaceAllSpaces(orm, input) };
      });
    } catch (error) {
      // Identical and different first proposals race on the first durable Space
      // identity. The loser reads the winner after its transaction rolls back
      // and classifies authored meaning, rather than exposing SQL timing.
      if (
        !(error instanceof ThingOwnershipError) &&
        !isSpacePrimaryKeyConflict(error) &&
        !isRepositoryStatePrimaryKeyConflict(error)
      ) {
        throw error;
      }
      const result = await this.loadAggregate();
      if (result.kind === 'uninitialized') throw error;
      return classifyInitializedAggregate(input, result.aggregate);
    }
  }

  async replaceAggregate(
    input: AggregateInput,
    expectedMetaSpaceId: UUID,
  ): Promise<ReplaceAggregateResult> {
    const intake = loadSpaceAggregate({
      metaSpaceId: input.metaSpaceId,
      snapshots: input.spaces,
    });
    if (!intake.ok) return { kind: 'aggregate-refused', errors: intake.errors };
    try {
      return await this.#database.transaction(async ({ orm }) => {
        const metaSpaceId = await lockMetaIdentity(orm);
        if (metaSpaceId === undefined) {
          if ((await loadEverySpace(orm)).length > 0)
            throw new AggregateInvariantError('Stored Spaces exist without Meta');
          return { kind: 'uninitialized' };
        }
        if (metaSpaceId !== expectedMetaSpaceId) {
          return { kind: 'conflict', currentMetaSpaceId: metaSpaceId };
        }
        // The baseline read is lock-free so topology-preserving commits retain
        // their fast path. Compare each revision again after taking its row lock:
        // a commit that won in between must conflict rather than be overwritten.
        for (const space of await loadEverySpace(orm)) {
          const lockedRevision = await writeSpaceDocumentUnderLock(orm, space.snapshot);
          if (lockedRevision !== space.revision)
            throw new StaleSpaceRevisionError(space.snapshot.id);
        }
        return { kind: 'replaced', aggregate: await replaceAllSpaces(orm, input) };
      });
    } catch (error) {
      if (!(error instanceof StaleSpaceRevisionError)) throw error;
      const current = await this.loadAggregate();
      return current.kind === 'uninitialized'
        ? current
        : { kind: 'conflict', currentMetaSpaceId: current.aggregate.metaSpaceId };
    }
  }

  async markExported(id: UUID, revision: bigint): Promise<void> {
    const updated = await this.#database.orm.public.Space.where({ id }).update({
      exportedRevision: toDatabaseRevision(revision),
    });
    if (updated === null) throw new Error(`Space ${id} does not exist`);
  }

  async commit(request: SpaceCommit): Promise<RepositoryCommitResult> {
    const refusal = commitIdentityRefusal(request);
    if (refusal !== undefined)
      return { kind: 'rejected', code: 'invalid-commit', message: refusal };

    try {
      return await this.#commitInTransaction(request);
    } catch (error) {
      // A Thing the commit writes is still owned by a Space the same commit did
      // not release. Complete intake cannot see it — the candidate aggregate is
      // consistent and the collision only exists in the stored rows the write
      // loop meets in request order. It is permanent, so it has to leave here
      // as a rejection: escaping instead becomes 503 `persistence-unavailable`,
      // which the client retries forever.
      if (error instanceof ThingOwnershipError) {
        return { kind: 'rejected', code: 'invalid-commit', message: error.message };
      }
      // The transaction has rolled back, so the current state is read fresh
      // outside it — reading it inside the aborted one would answer with rows
      // the caller can never observe.
      if (error instanceof StaleSpaceRevisionError) {
        return {
          kind: 'conflict',
          conflicts: [
            {
              spaceId: error.spaceId,
              current: await loadStoredSpace(this.#database.orm, error.spaceId),
            },
          ],
        };
      }
      throw error;
    }
  }

  #commitInTransaction(request: SpaceCommit): Promise<RepositoryCommitResult> {
    return this.#database.transaction(async ({ orm }) => {
      const topologyPreserving = await commitTopologyPreservingUpdate(orm, request);
      if (topologyPreserving !== undefined) return topologyPreserving;
      const metaSpaceId = await lockMetaIdentity(orm);
      const stored = await loadEverySpace(orm);
      const byId = new Map(stored.map((space) => [space.snapshot.id, space]));
      const baseline =
        metaSpaceId === undefined
          ? undefined
          : loadSpaceAggregate({
              metaSpaceId,
              snapshots: stored.map(({ snapshot }) => snapshot),
            });
      const baselineUnreferenced = new Set(
        baseline?.ok === false
          ? baseline.errors.flatMap((error) =>
              error.kind === 'ordinary-space-unreferenced' ? [error.spaceId] : [],
            )
          : [],
      );
      const conflicts: SpaceConflict[] = [];
      for (const change of request.changes) {
        const current = byId.get(change.spaceId);
        const stale =
          change.kind === 'create'
            ? current !== undefined
            : current?.revision !== change.expectedRevision;
        if (stale) conflicts.push({ spaceId: change.spaceId, current });
      }
      if (conflicts.length > 0) return { kind: 'conflict', conflicts };

      const candidate = new Map(byId);
      for (const change of request.changes) {
        if (change.kind === 'delete') candidate.delete(change.spaceId);
        else {
          candidate.set(change.spaceId, {
            snapshot: structuredClone(change.snapshot),
            revision: change.kind === 'create' ? 0n : change.expectedRevision + 1n,
            exportedRevision: byId.get(change.spaceId)?.exportedRevision ?? null,
          });
        }
      }
      // Answered after the conflicts, exactly as `MemorySpaceRepository` does:
      // a change set naming a Space the store does not hold is a conflict
      // whether or not Meta has been established, and only what follows needs a
      // complete aggregate to check.
      if (metaSpaceId === undefined) {
        return {
          kind: 'rejected',
          code: 'invalid-commit',
          message: 'The repository has no Meta Space',
        };
      }
      /*
       * Only a reference the caller did not submit is authoritative state, and
       * only that makes an incomplete deletion a conflict it can resolve by
       * reloading. A reference the caller kept in its own change set is its own
       * proposal, and answering `conflict` for it cannot be recovered from: the
       * reload returns the target at the revision the caller already holds, so
       * the identical change set conflicts again, forever. That falls through
       * to complete intake below and is refused. `memory.ts` draws the same
       * line, and `repository-contract.ts` holds both to it.
       */
      const aggregate = loadSpaceAggregate({
        metaSpaceId,
        snapshots: [...candidate.values()].map(({ snapshot }) => snapshot),
      });
      const deletedIds = new Set(
        request.changes.flatMap((change) => (change.kind === 'delete' ? [change.spaceId] : [])),
      );
      const changedIds = new Set(request.changes.map((change) => change.spaceId));
      const incompleteDeleteIds = new Set(
        aggregate.ok
          ? []
          : aggregate.errors.flatMap((error) =>
              error.kind === 'space-thing-target-missing' &&
              deletedIds.has(error.targetSpaceId) &&
              !changedIds.has(error.spaceId)
                ? [error.targetSpaceId]
                : [],
            ),
      );
      const incompleteDeletes = [...incompleteDeleteIds].map((spaceId) => ({
        spaceId,
        current: byId.get(spaceId),
      }));
      if (incompleteDeletes.length > 0) {
        return { kind: 'conflict', conflicts: incompleteDeletes };
      }
      if (!aggregate.ok) {
        const errors = aggregate.errors.filter(
          (error) =>
            error.kind !== 'ordinary-space-unreferenced' ||
            !baselineUnreferenced.has(error.spaceId),
        );
        if (errors.length > 0) return { kind: 'aggregate-refused', errors };
      }

      const revisions: { spaceId: UUID; revision: bigint }[] = [];
      const deletedSpaceIds: UUID[] = [];
      for (const change of request.changes) {
        if (change.kind === 'delete') {
          await orm.public.Thing.where({ spaceId: change.spaceId }).deleteAll();
          const deleted = await orm.public.Space.where({ id: change.spaceId }).delete();
          if (deleted === null)
            throw new Error(`Space ${change.spaceId} disappeared during commit`);
          deletedSpaceIds.push(change.spaceId);
        } else if (change.kind === 'create') {
          await createStoredSpace(orm, change.snapshot);
          revisions.push({ spaceId: change.spaceId, revision: 0n });
        } else {
          const revision = change.expectedRevision + 1n;
          await replaceStoredSpace(orm, change.snapshot, change.expectedRevision, revision);
          revisions.push({ spaceId: change.spaceId, revision });
        }
      }
      return { kind: 'committed', revisions, deletedSpaceIds };
    });
  }
}
