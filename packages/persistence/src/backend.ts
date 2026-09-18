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

/**
 * What a store decided about a commit, shared by both commit seams (ADR 0098).
 *
 * The stored seam adds its own refusal of a request it will not judge, and the
 * browser's adds the failures only a client can suffer; what a store *decided*
 * is the same vocabulary on either side, so it is written once here rather than
 * restated in each. Declared beside the values it is written in terms of, and
 * below `RepositoryCommitResult` in the import graph, so both can name it.
 */
export type CommitOutcome =
  | {
      kind: 'committed';
      revisions: readonly CommittedSpaceRevision[];
      deletedSpaceIds: readonly UUID[];
    }
  | { kind: 'conflict'; conflicts: readonly SpaceConflict[] }
  | { kind: 'aggregate-refused'; errors: readonly SpaceAggregateError[] };

export type CommitResult =
  | CommitOutcome
  | {
      kind: 'retryable-failure';
      code: 'network' | 'timeout' | 'unavailable' | 'rate-limited';
      message: string;
      retryAfterMs?: number;
    }
  | {
      kind: 'permanent-failure';
      // `payload-too-large` is separate from `protocol` although both are the
      // server declining the request as sent: it is the one permanent failure
      // an author can act on, by shortening what they wrote, and folding it in
      // with a format disagreement leaves them a sentence they cannot use.
      code: 'invalid-commit' | 'forbidden' | 'payload-too-large' | 'protocol';
      message: string;
    };

export interface SpaceBackend {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  loadAggregate(): Promise<AggregateLoadResult>;
  commit(request: SpaceCommit): Promise<CommitResult>;
}
