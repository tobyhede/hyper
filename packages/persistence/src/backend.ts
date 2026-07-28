import type { SpaceSnapshot, UUID } from '@project/core';

export interface SpaceSummary {
  id: UUID;
  title: string;
}

export interface LoadedSpace {
  snapshot: SpaceSnapshot;
  revision: bigint;
  exportedRevision: bigint | null;
}

export type CommitResult =
  | { kind: 'committed'; revision: bigint }
  | { kind: 'conflict'; current: LoadedSpace }
  | {
      kind: 'retryable-failure';
      code: 'network' | 'timeout' | 'unavailable' | 'rate-limited';
      message: string;
      retryAfterMs?: number;
    }
  | {
      kind: 'permanent-failure';
      code: 'invalid-snapshot' | 'not-found' | 'forbidden' | 'protocol';
      message: string;
    };

export interface SpaceBackend {
  listSpaces(): Promise<readonly SpaceSummary[]>;
  loadSpace(id: UUID): Promise<LoadedSpace | undefined>;
  commitSpace(snapshot: SpaceSnapshot, expectedRevision: bigint): Promise<CommitResult>;
}
