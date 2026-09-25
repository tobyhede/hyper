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
 * What a store decided about a commit, shared by both commit seams.
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

/**
 * Which expectation a `protocol` failure broke (ADR 0057).
 *
 * Nothing an author did causes one, so the author reads the one `protocol`
 * sentence whatever this says; it is typed context for a diagnostic rather than
 * copy, and never prose — a thrown value is carried as it was thrown.
 */
export type ProtocolFault =
  /** A committed answer to a single-Space commit named no revision for it. */
  | { kind: 'revision-omitted'; spaceId: UUID }
  /** A committed answer to a single-Space commit deleted Spaces it never asked to. */
  | { kind: 'unexpected-deletion'; spaceId: UUID; deletedSpaceIds: readonly UUID[] }
  /** A conflict answer to a single-Space commit named no conflict for it. */
  | { kind: 'conflict-omitted-space'; spaceId: UUID }
  /** Preparing or sending a coordinated commit threw rather than answering. */
  | { kind: 'coordinated-commit-threw'; cause: unknown }
  /**
   * A committed answer to a coordinated commit did not acknowledge each
   * participant and requested deletion exactly once. `omittedSpaceIds` names
   * the requested ones it left out, and is empty when what broke was a
   * repeated or unrequested entry instead.
   */
  | { kind: 'coordinated-result-malformed'; omittedSpaceIds: readonly UUID[] }
  /** An error response did not use `application/problem+json`. */
  | { kind: 'problem-media-type'; contentType: string | null }
  /** A Problem Details body's `status` disagreed with the HTTP status. */
  | { kind: 'problem-status-mismatch'; httpStatus: number; problemStatus: number }
  /** A response body failed to read or decode. */
  | { kind: 'malformed-response'; cause: unknown }
  /** A well-formed Problem Details code a commit never answers. */
  | {
      kind: 'unexpected-problem';
      problemCode:
        'not-found' | 'invalid-space-id' | 'unsupported-media-type' | 'method-not-allowed';
    };

export type CommitResult =
  | CommitOutcome
  | {
      kind: 'retryable-failure';
      code: 'network' | 'timeout' | 'unavailable' | 'rate-limited';
      retryAfterMs?: number;
    }
  | {
      kind: 'permanent-failure';
      // `payload-too-large` is separate from `protocol` although both are the
      // server declining the request as sent: it is the one permanent failure
      // an author can act on, by shortening what they wrote, and folding it in
      // with a format disagreement leaves them a sentence they cannot use.
      code: 'invalid-commit' | 'forbidden' | 'payload-too-large';
    }
  | { kind: 'permanent-failure'; code: 'protocol'; fault: ProtocolFault };

export interface SpaceBackend {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  loadAggregate(): Promise<AggregateLoadResult>;
  commit(request: SpaceCommit): Promise<CommitResult>;
}
