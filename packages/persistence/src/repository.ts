import type { UUID } from '@project/core';
import type {
  CommittedSpaceRevision,
  LoadedAggregate,
  LoadedSpace,
  SpaceCommit,
  SpaceConflict,
  SpaceSummary,
} from './backend';
import type { SpaceAggregateError } from '@project/graph';

/** The store-side result has no transport failures. */
export type RepositoryCommitResult =
  | {
      kind: 'committed';
      revisions: readonly CommittedSpaceRevision[];
      deletedSpaceIds: readonly UUID[];
    }
  | { kind: 'conflict'; conflicts: readonly SpaceConflict[] }
  | { kind: 'aggregate-refused'; errors: readonly SpaceAggregateError[] }
  | { kind: 'rejected'; code: 'invalid-commit'; message: string };

/** The narrow stored seam consumed by the Fetch application. */
export interface SpaceResourceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  loadAggregate(): Promise<LoadedAggregate>;
  commit(request: SpaceCommit): Promise<RepositoryCommitResult>;
}
