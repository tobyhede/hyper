import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import type { LoadedSpace } from '../src/index';
import { MemorySpaceBackend } from '../src/index';
import { spaceBackendContract } from './backend-contract';

spaceBackendContract('MemorySpaceBackend', async (initial) => ({
  backend: new MemorySpaceBackend(initial),
  close: () => Promise.resolve(),
}));

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

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
    missing.id = MISSING_ID;
    await expect(backend.loadSpace(missing.id)).resolves.toBeUndefined();
    await expect(backend.commitSpace(missing, 0n)).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'not-found',
      message: `Space ${missing.id} does not exist`,
    });
  });

  it('rejects shape-valid snapshots that fail normal domain intake', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const secondCard = {
      id: CARD_B,
      document: { title: 'B', kind: 'markdown' as const, body: 'B' },
    };
    const invalidSnapshots = [
      {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          routes: [{ id: ROUTE_ID, title: 'Dangling', edges: [{ from: CARD_ID, to: MISSING_ID }] }],
        },
      },
      {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          routes: [
            {
              id: ROUTE_ID,
              title: 'Duplicate Edge',
              edges: [
                { from: CARD_ID, to: CARD_B },
                { from: CARD_ID, to: CARD_B },
              ],
            },
          ],
        },
        cards: [...loaded.snapshot.cards, secondCard],
      },
      {
        ...loaded.snapshot,
        cards: [
          {
            id: CARD_ID,
            document: { title: 'Alias', kind: 'alias' as const, target: MISSING_ID },
          },
        ],
      },
      {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'Broken',
              kind: 'positioned' as const,
              positions: { [MISSING_ID]: { x: 0, y: 0 } },
            },
          ],
          defaultView: MISSING_ID,
        },
      },
    ];

    for (const snapshot of invalidSnapshots) {
      await expect(backend.commitSpace(snapshot, 3n)).resolves.toMatchObject({
        kind: 'permanent-failure',
        code: 'invalid-snapshot',
      });
    }
    await expect(backend.loadSpace(SPACE_ID)).resolves.toEqual(loaded);
  });
});
