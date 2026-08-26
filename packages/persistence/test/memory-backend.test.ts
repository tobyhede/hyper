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
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const loaded: LoadedSpace = {
  snapshot: {
    id: SPACE_ID,
    document: { version: 1, title: 'One' },
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
    // SAFETY: `JSON.parse` returns `any`; narrowed to `unknown` only so this
    // stays a type-checked no-op cast rather than letting `any` mask what the
    // assertion below is actually about — `message` is prose, not JSON, and is
    // expected to throw before the cast's type ever matters.
    expect(() => JSON.parse(message) as unknown).toThrow();
  });

  it('rejects shape-valid snapshots that fail normal domain intake', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const secondCard = {
      id: CARD_B,
      document: { title: 'B', kind: 'markdown' as const, body: 'B' },
    };
    const invalidSnapshots = [
      // A graph reaches intake only through the layout that owns it (ADR 0040),
      // so both graph rules are broken inside one, over its own members.
      {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'Owner',
              kind: 'positioned' as const,
              positions: { [CARD_ID]: { x: 0, y: 0, state: 'closed' as const } },
              graphs: [
                { id: GRAPH_ID, title: 'Dangling', edges: [{ from: CARD_ID, to: MISSING_ID }] },
              ],
            },
          ],
        },
      },
      {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'Owner',
              kind: 'positioned' as const,
              positions: {
                [CARD_ID]: { x: 0, y: 0, state: 'closed' as const },
                [CARD_B]: { x: 300, y: 0, state: 'closed' as const },
              },
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
      // separately a defaultRenderer naming a layout that does not exist. Breaking
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
              positions: { [MISSING_ID]: { x: 0, y: 0, state: 'closed' as const } },
              // A member, so the edge rule is satisfied and only the position's
              // own reference fails — one rule per snapshot, as above.
              graphs: [
                {
                  id: GRAPH_ID,
                  title: 'Over the placed card',
                  edges: [{ from: MISSING_ID, to: MISSING_ID }],
                },
              ],
            },
          ],
          defaultRenderer: LAYOUT_ID,
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
              positions: { [CARD_ID]: { x: 0, y: 0, state: 'closed' as const } },
              graphs: [
                {
                  id: GRAPH_ID,
                  title: 'Over the placed card',
                  edges: [{ from: CARD_ID, to: CARD_ID }],
                },
              ],
            },
          ],
          defaultRenderer: MISSING_ID,
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

  /**
   * The HTTP-boundary shape evidence for ADR 0066: the backend validates a
   * commit through `loadSpaceSnapshot`, the same intake the server uses, so a
   * Layout holding all three Placement states round-trips exactly as
   * committed — nothing here re-derives or normalizes an entry's shape.
   */
  it('round-trips a never-Opened, an Open and a Closed-with-remembered-size Placement entry', async () => {
    const backend = new MemorySpaceBackend([loaded]);
    const secondCard = {
      id: CARD_B,
      document: { title: 'B', kind: 'markdown' as const, body: 'B' },
    };
    const thirdCard = {
      id: CARD_C,
      document: { title: 'C', kind: 'markdown' as const, body: 'C' },
    };
    const committed = {
      ...loaded.snapshot,
      document: {
        ...loaded.snapshot.document,
        layouts: [
          {
            id: LAYOUT_ID,
            title: 'Owner',
            kind: 'positioned' as const,
            positions: {
              [CARD_ID]: { x: 0, y: 0, state: 'closed' as const },
              [CARD_B]: {
                x: 320,
                y: 0,
                state: 'open' as const,
                openSize: { width: 560, height: 420 },
              },
              [CARD_C]: {
                x: 640,
                y: 0,
                state: 'closed' as const,
                openSize: { width: 700, height: 500 },
              },
            },
            graphs: [{ id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_ID, to: CARD_B }] }],
          },
        ],
      },
      cards: [...loaded.snapshot.cards, secondCard, thirdCard],
    };

    await expect(backend.commitSpace(committed, 3n)).resolves.toMatchObject({
      kind: 'committed',
    });
    const stored = await backend.loadSpace(SPACE_ID);
    expect(stored?.snapshot.document.layouts?.[0]?.positions).toEqual({
      [CARD_ID]: { x: 0, y: 0, state: 'closed' },
      [CARD_B]: { x: 320, y: 0, state: 'open', openSize: { width: 560, height: 420 } },
      [CARD_C]: {
        x: 640,
        y: 0,
        state: 'closed',
        openSize: { width: 700, height: 500 },
      },
    });
  });
});
