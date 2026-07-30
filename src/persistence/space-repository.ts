import type { ImportSpace, SpaceSnapshot, UUID } from '@project/core';

export interface SpaceSummary {
  id: UUID;
  title: string;
}

export interface StoredSpace {
  snapshot: SpaceSnapshot;
  revision: bigint;
  exportedRevision: bigint | null;
}

export type RepositoryCommitResult =
  | { kind: 'committed'; revision: bigint }
  | { kind: 'conflict'; current: StoredSpace }
  | {
      kind: 'rejected';
      code: 'invalid-snapshot' | 'not-found';
      message: string;
    };

/**
 * No `conflict` variant, unlike {@link RepositoryCommitResult} above.
 *
 * Import is insert-only (ADR 0030) and takes no expected revision, so it runs no
 * optimistic concurrency check and has no revision to disagree about. A taken id
 * is `duplicate-identity` whether it was stored long ago or by a rival
 * transaction a moment earlier — a distinction READ COMMITTED cannot make
 * deterministically, and one no caller could act on, since import never updates
 * or merges existing content.
 */
export type RepositoryImportResult =
  | { kind: 'imported'; spaces: readonly StoredSpace[] }
  | {
      kind: 'rejected';
      code: 'invalid-snapshot' | 'duplicate-identity' | 'card-ownership';
      message: string;
    };

export type ImportMode = 'insert' | 'truncate';

export interface SpaceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<StoredSpace | undefined>;
  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult>;
  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult>;
}
