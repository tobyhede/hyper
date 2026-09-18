import { MemorySpaceBackend } from '../src/index';
import { spaceBackendContract } from './backend-contract';

spaceBackendContract('MemorySpaceBackend', ({ spaces, metaSpaceId }) =>
  Promise.resolve({
    backend: new MemorySpaceBackend(metaSpaceId, spaces),
    close: () => Promise.resolve(),
  }),
);
