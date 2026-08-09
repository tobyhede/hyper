import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import type { LoadedSpace } from '../src/index';
import { MemorySpaceBackend } from '../src/index';
import { spaceBackendContract } from './backend-contract';

spaceBackendContract('MemorySpaceBackend', (initial) =>
  Promise.resolve({
    backend: new MemorySpaceBackend(initial),
    close: () => Promise.resolve(),
  }),
);

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const loaded: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 2, title: 'One', graphs: [] },
    cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'Original' } }],
  },
  revision: 3n,
  exportedRevision: 2n,
};

// Listing, loading, committing and stale-conflict reporting are the shared
// backend contract above, which exercises them over revisions past
// Number.MAX_SAFE_INTEGER. Only what is specific to this adapter lives here.
describe('MemorySpaceBackend', () => {
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

  /**
   * The rejection a client actually reads. Every other `invalid-snapshot`
   * assertion in the repo matches on `code`, which stayed identical while the
   * message changed underneath it: the backends that dropped their own outer
   * `spaceSnapshotSchema.safeParse` stopped forwarding `parsed.error.message` —
   * Zod's whole serialized issue array in one string — and now forward the
   * intake's located `invalid-shape` prose ("A wire codec throws prose, not
   * Zod"). Pin the shape, not Zod's wording.
   */
  it('rejects with located intake prose rather than a serialized Zod dump', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const invalid = structuredClone(loaded.snapshot);
    invalid.document.title = '';

    const result = await backend.commitSpace(invalid, 3n);

    expect(result).toMatchObject({ kind: 'permanent-failure', code: 'invalid-snapshot' });
    const message = result.kind === 'permanent-failure' ? result.message : '';
    expect(message).toMatch(/^document\.title: \S/);
    expect(message.startsWith('[')).toBe(false);
    expect(() => JSON.parse(message) as unknown).toThrow();
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
          graphs: [{ id: GRAPH_ID, title: 'Dangling', edges: [{ from: CARD_ID, to: MISSING_ID }] }],
        },
      },
      {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          graphs: [
            {
              id: GRAPH_ID,
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
      // One rule per snapshot: a layout placing a card that does not exist, and
      // separately a defaultView naming a layout that does not exist. Breaking
      // both at once would pass even if only one of the two were enforced.
      {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'Broken positions',
              kind: 'positioned' as const,
              positions: { [MISSING_ID]: { x: 0, y: 0 } },
            },
          ],
          defaultView: LAYOUT_ID,
        },
      },
      {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'Placed',
              kind: 'positioned' as const,
              positions: { [CARD_ID]: { x: 0, y: 0 } },
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
