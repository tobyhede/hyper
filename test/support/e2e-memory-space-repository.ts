import { MemorySpaceRepository } from './memory-space-repository';

/** In-process repository used behind the real HTTP seam in database-free tests. */
export class E2eMemorySpaceRepository extends MemorySpaceRepository {}
