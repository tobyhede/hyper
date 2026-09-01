import type { RepositoryCommitResult, SpaceCommit } from '@project/persistence';
import { MemorySpaceRepository } from './memory-space-repository';

/** In-process repository used behind the real HTTP seam in database-free tests. */
export class E2eMemorySpaceRepository extends MemorySpaceRepository {
  commitAttempts = 0;

  override commit(request: SpaceCommit): Promise<RepositoryCommitResult> {
    this.commitAttempts += 1;
    return super.commit(request);
  }
}
