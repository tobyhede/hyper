import type { SpaceSnapshot, UUID } from '@project/core';

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

export type RepositoryImportResult =
  | { kind: 'imported'; spaces: readonly StoredSpace[] }
  | { kind: 'conflict'; current: StoredSpace }
  | {
      kind: 'rejected';
      code: 'invalid-snapshot';
      message: string;
    };

export interface SpaceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<StoredSpace | undefined>;
  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult>;
  importSpaces(snapshots: readonly SpaceSnapshot[]): Promise<RepositoryImportResult>;
}
