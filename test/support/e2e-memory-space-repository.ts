import type { SpaceSnapshot } from '@project/core';
import type { RepositoryCommitResult } from '@project/persistence';
import { MemorySpaceRepository } from './memory-space-repository';

/** In-process repository used behind the real HTTP seam in database-free tests. */
export class E2eMemorySpaceRepository extends MemorySpaceRepository {
  commitAttempts = 0;

  override commitSpace(
    snapshot: SpaceSnapshot,
    expectedRevision: bigint,
  ): Promise<RepositoryCommitResult> {
    this.commitAttempts += 1;
    return super.commitSpace(snapshot, expectedRevision);
  }
}
