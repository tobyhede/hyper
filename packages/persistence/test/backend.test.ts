import { describe, expect, it } from 'vitest';
import type { LoadedSpace } from '../src/index';
import { MemorySpaceBackend } from '../src/index';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const CARD_ID = '00000000-0000-4000-8000-000000000002';

const loaded: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 2, title: 'One', routes: [] },
    cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'Original' } }],
  },
  revision: 3n,
  exportedRevision: 2n,
};

describe('MemorySpaceBackend', () => {
  it('lists, loads, and revision-checks authoritative complete snapshots', async () => {
    const backend = new MemorySpaceBackend([loaded]);

    await expect(backend.listSpaces()).resolves.toEqual([{ id: SPACE_ID, title: 'One' }]);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toEqual(loaded);

    const changed = structuredClone(loaded.snapshot);
    changed.document.title = 'Changed';
    await expect(backend.commitSpace(changed, 3n)).resolves.toEqual({
      kind: 'committed',
      revision: 4n,
    });
    await expect(backend.loadSpace(SPACE_ID)).resolves.toEqual({
      snapshot: changed,
      revision: 4n,
      exportedRevision: 2n,
    });

    await expect(backend.commitSpace(loaded.snapshot, 3n)).resolves.toEqual({
      kind: 'conflict',
      current: { snapshot: changed, revision: 4n, exportedRevision: 2n },
    });
  });

  it('reports invalid complete snapshots and missing spaces as permanent failures', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const invalid = structuredClone(loaded.snapshot);
    invalid.document.title = '';
    await expect(backend.commitSpace(invalid, 3n)).resolves.toMatchObject({
      kind: 'permanent-failure',
      code: 'invalid-snapshot',
    });

    const missing = structuredClone(loaded.snapshot);
    missing.id = '00000000-0000-4000-8000-000000000099';
    await expect(backend.loadSpace(missing.id)).resolves.toBeUndefined();
    await expect(backend.commitSpace(missing, 0n)).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'not-found',
      message: `Space ${missing.id} does not exist`,
    });
  });
});
