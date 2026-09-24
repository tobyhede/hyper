import { describe, expect, it } from 'vitest';
import { MemorySpaceBackend } from '../src/index';
import { contractLoaded, spaceBackendContract } from './backend-contract';

spaceBackendContract('MemorySpaceBackend', ({ spaces, metaSpaceId }) =>
  Promise.resolve({
    backend: new MemorySpaceBackend(metaSpaceId, spaces),
    close: () => Promise.resolve(),
  }),
);

describe('MemorySpaceBackend geometry intake', () => {
  // `JSON.parse('1e400')` is `Infinity`; storage cannot encode it back, so the
  // commit refuses it before the Space changes.
  it.each([Infinity, -Infinity])(
    'refuses a coordinate of %s, leaving the Space as it was',
    async (value) => {
      const { snapshot } = contractLoaded;
      const backend = new MemorySpaceBackend(snapshot.id, [contractLoaded]);
      const overflowed = structuredClone(snapshot);
      const [placement] = Object.values(overflowed.document.maps?.[0]?.positions ?? {});
      if (placement === undefined) throw new Error('fixture places a Resource');
      placement.x = value;

      const result = await backend.commit({
        changes: [
          {
            kind: 'update',
            spaceId: snapshot.id,
            snapshot: overflowed,
            expectedRevision: contractLoaded.revision,
          },
        ],
      });

      expect(result.kind).not.toBe('committed');
      await expect(backend.loadSpace(snapshot.id)).resolves.toEqual(contractLoaded);
    },
  );
});
