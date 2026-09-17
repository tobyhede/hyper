import type { SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import {
  committedRevision,
  type LoadedSpace,
  type RepositoryCommitResult,
  type SpaceChange,
  type SpaceCommit,
} from '@project/persistence';

/*
 * The SQL adapters' fast path: a single update decided against the one stored
 * Space it names, without reading the complete aggregate.
 *
 * It is an optimisation of `decideCommit` and never a second set of rules, so it
 * answers only what the complete-aggregate decision would answer the same way —
 * a revision conflict, or a write that moves no snapshot boundary — and hands
 * everything else to that decision. Both adapters import this one copy until
 * ticket 24 absorbs it into the one SQL Space repository (ADR 0093).
 *
 * The caller runs `commitIdentityRefusal` first. This path reads the stored
 * Space by `change.spaceId` and writes to `snapshot.id`, so a change naming one
 * Space with another's snapshot must be refused before it gets here.
 */

type UpdateChange = Extract<SpaceChange, { kind: 'update' }>;

/** The fast path's decision, which may also hand the commit to the complete-aggregate decision. */
type TopologyPreservingDecision =
  | { readonly kind: 'answer'; readonly result: RepositoryCommitResult }
  | { readonly kind: 'write'; readonly result: RepositoryCommitResult }
  | { readonly kind: 'aggregate-path' };

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
 * Decide a single update against the stored Space it names. A snapshot that
 * fails intake, or one that moves the snapshot boundary — structure,
 * membership, a Thing's kind, or a Space Thing's selection — goes to the
 * complete-aggregate decision, which alone can say where in the aggregate a
 * refusal sits.
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
