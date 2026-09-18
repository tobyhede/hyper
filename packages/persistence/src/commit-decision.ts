import type { UUID } from '@project/core';
import { loadSpaceAggregate } from '@project/graph';
import type { LoadedSpace, SpaceChange, SpaceCommit, SpaceConflict } from './backend';
import type { RepositoryCommitResult } from './repository';

/*
 * What a commit means, decided once for every implementation (ADR 0095).
 *
 * `decideCommit` takes what an implementation has already read and answers what
 * it must do next — answer the caller, or write — before any write happens. The
 * implementations keep their own reads, writes, locking and error
 * classification; nothing here names a store. Both database adapters,
 * `MemorySpaceRepository` and `MemorySpaceBackend` call it, and
 * `test/support/repository-contract.ts` holds the repositories to what it
 * decides.
 */

type WrittenChange = Exclude<SpaceChange, { kind: 'delete' }>;

/** What an implementation does next: answer the caller now, or write and then answer. */
type CommitDecision =
  | { readonly kind: 'answer'; readonly result: RepositoryCommitResult }
  | { readonly kind: 'write'; readonly result: RepositoryCommitResult };

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

/**
 * Decide a change set against every stored Space and the Meta identity, by
 * validating the complete candidate aggregate it would produce.
 *
 * `stored` is every stored Space in the order the implementation reads them —
 * ascending by id — because an `invalid-space-snapshot` refusal names its Space
 * by that position. A `conflict` names the `LoadedSpace` values it was given, so
 * an implementation that must not hand out its own state passes copies.
 */
export const decideCommit = (
  request: SpaceCommit,
  metaSpaceId: UUID | undefined,
  stored: readonly LoadedSpace[],
): CommitDecision => {
  const refusal = commitIdentityRefusal(request);
  if (refusal !== undefined) return { kind: 'answer', result: refusal };

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
  // Answered after the conflicts: a change set naming a Space the store does
  // not hold is a conflict whether or not Meta has been established, and only
  // what follows needs a complete aggregate to check.
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
   * to complete intake below and is refused.
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
