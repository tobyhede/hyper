import type { SpaceSnapshot, UUID } from '@project/core';
import { loadSpaceAggregate, loadSpaceSnapshot } from '@project/graph';
import type {
  LoadedSpace,
  RepositoryCommitResult,
  SpaceChange,
  SpaceCommit,
  SpaceConflict,
} from '@project/persistence';

/*
 * What a commit means, decided once for every database adapter.
 *
 * Each function here takes what an adapter has already read and answers what
 * the adapter must do next — answer the caller, or write — before any write
 * happens. The adapters keep their own reads, writes, locking and driver error
 * classification; nothing here names a database. `memory.ts` in
 * `@project/persistence` draws the same lines by hand, and
 * `test/support/repository-contract.ts` holds all three to them.
 */

type WrittenChange = Exclude<SpaceChange, { kind: 'delete' }>;
type UpdateChange = Extract<SpaceChange, { kind: 'update' }>;

/** What an adapter does next: answer the caller now, or write and then answer. */
export type CommitDecision =
  | { readonly kind: 'answer'; readonly result: RepositoryCommitResult }
  | { readonly kind: 'write'; readonly result: RepositoryCommitResult };

/** The fast path's decision, which may also hand the commit to the aggregate path. */
export type TopologyPreservingDecision = CommitDecision | { readonly kind: 'aggregate-path' };

/** The revision a created or updated Space carries once the commit lands. */
export const committedRevision = (change: WrittenChange): bigint =>
  change.kind === 'create' ? 0n : change.expectedRevision + 1n;

/**
 * Refuse a change set that names one Space twice, or whose change and snapshot
 * disagree about which Space it is. Answered before any read.
 */
export const commitIdentityRefusal = (request: SpaceCommit): RepositoryCommitResult | undefined => {
  const ids = new Set<UUID>();
  for (const change of request.changes) {
    if (ids.has(change.spaceId)) {
      return {
        kind: 'rejected',
        code: 'invalid-commit',
        message: `Space ${change.spaceId} is named more than once`,
      };
    }
    ids.add(change.spaceId);
    if (change.kind !== 'delete' && change.snapshot.id !== change.spaceId) {
      return {
        kind: 'rejected',
        code: 'invalid-commit',
        message: `Change Space id ${change.spaceId} does not match its snapshot`,
      };
    }
  }
  return undefined;
};

const committed = (request: SpaceCommit): RepositoryCommitResult => ({
  kind: 'committed',
  revisions: request.changes.flatMap((change) =>
    change.kind === 'delete'
      ? []
      : [{ spaceId: change.spaceId, revision: committedRevision(change) }],
  ),
  deletedSpaceIds: request.changes.flatMap((change) =>
    change.kind === 'delete' ? [change.spaceId] : [],
  ),
});

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
export const topologyPreservingCandidate = (request: SpaceCommit): UpdateChange | undefined => {
  const [change] = request.changes;
  return request.changes.length === 1 && change.kind === 'update' ? change : undefined;
};

/**
 * Decide a single update against the stored Space it names, without the
 * complete aggregate. A change that moves the snapshot boundary — structure,
 * membership, a Thing's kind, or a Space Thing's selection — goes to the
 * aggregate path instead.
 */
export const decideTopologyPreservingUpdate = (
  change: UpdateChange,
  current: LoadedSpace | undefined,
): TopologyPreservingDecision => {
  if (current?.revision !== change.expectedRevision) {
    return {
      kind: 'answer',
      result: { kind: 'conflict', conflicts: [{ spaceId: change.spaceId, current }] },
    };
  }
  const intake = loadSpaceSnapshot(change.snapshot);
  if (!intake.ok) {
    return {
      kind: 'answer',
      result: {
        kind: 'aggregate-refused',
        errors: [{ kind: 'invalid-space-snapshot', snapshotIndex: 0, errors: intake.errors }],
      },
    };
  }
  if (!preservesSnapshotBoundary(current.snapshot, change.snapshot)) {
    return { kind: 'aggregate-path' };
  }
  return { kind: 'write', result: committed({ changes: [change] }) };
};

/**
 * Decide a change set against every stored Space and the Meta identity, by
 * validating the complete candidate aggregate it would produce.
 */
export const decideAggregateCommit = (
  request: SpaceCommit,
  metaSpaceId: UUID | undefined,
  stored: readonly LoadedSpace[],
): CommitDecision => {
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
  if (conflicts.length > 0) return { kind: 'answer', result: { kind: 'conflict', conflicts } };

  const candidate = new Map(byId);
  for (const change of request.changes) {
    if (change.kind === 'delete') candidate.delete(change.spaceId);
    else {
      candidate.set(change.spaceId, {
        snapshot: structuredClone(change.snapshot),
        revision: committedRevision(change),
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
      kind: 'answer',
      result: {
        kind: 'rejected',
        code: 'invalid-commit',
        message: 'The repository has no Meta Space',
      },
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
    return { kind: 'answer', result: { kind: 'conflict', conflicts: incompleteDeletes } };
  }
  if (!aggregate.ok) {
    const errors = aggregate.errors.filter(
      (error) =>
        error.kind !== 'ordinary-space-unreferenced' || !baselineUnreferenced.has(error.spaceId),
    );
    if (errors.length > 0) return { kind: 'answer', result: { kind: 'aggregate-refused', errors } };
  }
  return { kind: 'write', result: committed(request) };
};
