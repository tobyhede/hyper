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

export type RepositoryImportResult =
  | { kind: 'imported'; spaces: readonly StoredSpace[] }
  | { kind: 'conflict'; current: StoredSpace }
  | {
      kind: 'rejected';
      code: 'invalid-snapshot' | 'duplicate-identity' | 'card-ownership';
      message: string;
    };

export type ImportMode = 'upsert' | 'truncate';

export interface SpaceRepository {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<StoredSpace | undefined>;
  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<RepositoryCommitResult>;
  importSpaces(input: readonly ImportSpace[], mode: ImportMode): Promise<RepositoryImportResult>;
}
