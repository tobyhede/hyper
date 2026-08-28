import type { ImportSpace, UUID } from '@project/core';
import type { LoadedSpace, SpaceResourceRepository } from '@project/persistence';

/**
 * No `conflict` variant, unlike {@link RepositoryCommitResult}.
 *
 * Import is insert-only (ADR 0030) and takes no expected revision, so it runs no
 * optimistic concurrency check and has no revision to disagree about. A taken id
 * is `duplicate-identity` whether it was stored long ago or by a rival
 * transaction a moment earlier — a distinction READ COMMITTED cannot make
 * deterministically, and one no caller could act on, since import never updates
 * or merges existing content.
 */
export type RepositoryImportResult =
  | { kind: 'imported'; spaces: readonly LoadedSpace[] }
  | {
      kind: 'rejected';
      code: 'invalid-snapshot' | 'duplicate-identity' | 'card-ownership';
      message: string;
    };

export type ImportMode = 'insert' | 'truncate';

/**
 * The server-side seam: everything the HTTP application consumes, plus the two
 * members only the CLI reaches for.
 *
 * Extension, not a second declaration. `listSpaces`, `loadSpace` and
 * `commitSpace` are `SpaceResourceRepository`'s, so a change to any of them
 * cannot leave the two sides disagreeing — and the browser still cannot name
 * import or export, because the seam the Fetch application takes does not
 * declare them.
 */
export interface SpaceRepository extends SpaceResourceRepository {
  /** Application state, separate from every authored Space document. */
  entrySpaceId(): Promise<UUID | undefined>;
  setEntrySpace(id: UUID): Promise<void>;
  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult>;
  /** Records the revision projected by a completed external export. */
  markExported(id: UUID, revision: bigint): Promise<void>;
}
