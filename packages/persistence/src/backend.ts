import type { SpaceSnapshot, UUID } from '@project/core';
import type { SpaceAggregateError } from '@project/graph';

export interface SpaceSummary {
  id: UUID;
  title: string;
}

export interface LoadedSpace {
  snapshot: SpaceSnapshot;
  revision: bigint;
  exportedRevision: bigint | null;
}

export interface LoadedAggregate {
  metaSpaceId: UUID;
  spaces: readonly LoadedSpace[];
}

export type AggregateLoadResult =
  { kind: 'uninitialized' } | { kind: 'loaded'; aggregate: LoadedAggregate };

export type SpaceChange =
  | { kind: 'create'; spaceId: UUID; snapshot: SpaceSnapshot }
  | { kind: 'update'; spaceId: UUID; snapshot: SpaceSnapshot; expectedRevision: bigint }
  | { kind: 'delete'; spaceId: UUID; expectedRevision: bigint };

/** A commit is always an authored, non-empty set of changes. */
export interface SpaceCommit {
  changes: readonly [SpaceChange, ...SpaceChange[]];
}

export interface CommittedSpaceRevision {
  spaceId: UUID;
  revision: bigint;
}

export interface SpaceConflict {
  spaceId: UUID;
  current: LoadedSpace | undefined;
}

export type CommitResult =
  | {
      kind: 'committed';
      revisions: readonly CommittedSpaceRevision[];
      deletedSpaceIds: readonly UUID[];
    }
  | { kind: 'conflict'; conflicts: readonly SpaceConflict[] }
  | { kind: 'aggregate-refused'; errors: readonly SpaceAggregateError[] }
  | {
      kind: 'retryable-failure';
      code: 'network' | 'timeout' | 'unavailable' | 'rate-limited';
      message: string;
      retryAfterMs?: number;
    }
  | {
      kind: 'permanent-failure';
      code: 'invalid-commit' | 'forbidden' | 'protocol';
      message: string;
    };

export interface SpaceBackend {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  loadAggregate(): Promise<AggregateLoadResult>;
  commit(request: SpaceCommit): Promise<CommitResult>;
}
