import { uuidSchema } from '@project/core';
import { MemorySpaceBackend } from '../src/index';
import { spaceBackendContract } from './backend-contract';

const FALLBACK_META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

spaceBackendContract('MemorySpaceBackend', (initial) =>
  Promise.resolve({
    backend: new MemorySpaceBackend(initial[0]?.snapshot.id ?? FALLBACK_META_ID, initial),
    close: () => Promise.resolve(),
  }),
);
