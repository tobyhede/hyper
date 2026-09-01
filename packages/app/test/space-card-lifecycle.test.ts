import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { MemorySpaceBackend, createSpaceSessionRegistry } from '@project/persistence';
import { createSpaceCardLifecycle } from '../src/space-card-lifecycle';

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const TARGET_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const TARGET_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const TARGET_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');
const SECOND_SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000015');
const CHILD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000016');
const CHILD_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000017');
const CHILD_LINK_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000018');

const metaSnapshot: SpaceSnapshot = {
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    defaultRenderer: META_LAYOUT_ID,
    layouts: [
      {
        id: META_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [META_CARD_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: META_GRAPH_ID,
      },
    ],
  },
  cards: [
    {
      id: META_CARD_ID,
      document: { title: 'Meta', kind: 'markdown', body: '' },
    },
  ],
};

const idSource = (ids: readonly UUID[]) => {
  const remaining = [...ids];
  return () => {
    const id = remaining.shift();
    if (id === undefined) throw new Error('test identity source was exhausted');
    return id;
  };
};

const targetSnapshot: SpaceSnapshot = {
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    defaultRenderer: TARGET_LAYOUT_ID,
    layouts: [
      {
        id: TARGET_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [TARGET_CARD_ID]: { x: 0, y: 0, open: false } },
        graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: TARGET_GRAPH_ID,
      },
    ],
  },
  cards: [
    {
      id: TARGET_CARD_ID,
      document: { title: 'Architecture', kind: 'markdown', body: '' },
    },
  ],
};

describe('Space Card lifecycle', () => {
  it('atomically creates the first Space Card and its normal target Space', async () => {
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: metaSnapshot, revision: 3n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
    const lifecycle = createSpaceCardLifecycle({
      backend,
      registry,
      newId: idSource([
        TARGET_ID,
        TARGET_CARD_ID,
        TARGET_LAYOUT_ID,
        TARGET_GRAPH_ID,
        SPACE_CARD_ID,
      ]),
    });

    await expect(
      lifecycle.create({
        containingSpaceId: META_ID,
        layoutId: META_LAYOUT_ID,
        title: 'Architecture',
        position: { x: 240, y: 80 },
      }),
    ).resolves.toMatchObject({ kind: 'committed' });

    const aggregate = await backend.loadAggregate();
    expect(aggregate.spaces).toHaveLength(2);
    const storedMeta = await backend.loadSpace(META_ID);
    expect(storedMeta?.revision).toBe(4n);
    expect(storedMeta?.snapshot.cards).toContainEqual({
      id: SPACE_CARD_ID,
      document: { title: 'Architecture', kind: 'space', spaceId: TARGET_ID },
    });
    expect(storedMeta?.snapshot.document.layouts?.[0]?.positions[SPACE_CARD_ID]).toEqual({
      x: 240,
      y: 80,
      open: false,
    });
    expect(await backend.loadSpace(TARGET_ID)).toEqual({
      revision: 0n,
      exportedRevision: null,
      snapshot: {
        id: TARGET_ID,
        document: {
          version: 1,
          title: 'Architecture',
          defaultRenderer: TARGET_LAYOUT_ID,
          layouts: [
            {
              id: TARGET_LAYOUT_ID,
              title: 'Layout 1',
              kind: 'positioned',
              positions: { [TARGET_CARD_ID]: { x: 0, y: 0, open: false } },
              graphs: [{ id: TARGET_GRAPH_ID, title: 'Graph 1', edges: [] }],
              activeGraph: TARGET_GRAPH_ID,
            },
          ],
        },
        cards: [
          {
            id: TARGET_CARD_ID,
            document: { title: 'Architecture', kind: 'markdown', body: '' },
          },
        ],
      },
    });
  });

  it('links an existing Space and deletes its target only after the last reference is removed', async () => {
    const linkedMeta: SpaceSnapshot = {
      ...metaSnapshot,
      cards: [
        ...metaSnapshot.cards,
        {
          id: SPACE_CARD_ID,
          document: { title: 'First link', kind: 'space', spaceId: TARGET_ID },
        },
      ],
      document: {
        ...metaSnapshot.document,
        layouts: metaSnapshot.document.layouts?.map((layout) => ({
          ...layout,
          positions: {
            ...layout.positions,
            [SPACE_CARD_ID]: { x: 240, y: 80, open: false },
          },
        })),
      },
    };
    const targetWithChild: SpaceSnapshot = {
      ...targetSnapshot,
      cards: [
        ...targetSnapshot.cards,
        {
          id: CHILD_LINK_ID,
          document: { title: 'Child', kind: 'space', spaceId: CHILD_ID },
        },
      ],
    };
    const child: SpaceSnapshot = {
      id: CHILD_ID,
      document: { version: 1, title: 'Child' },
      cards: [
        {
          id: CHILD_CARD_ID,
          document: { title: 'Child', kind: 'markdown', body: '' },
        },
      ],
    };
    const backend = new MemorySpaceBackend(META_ID, [
      { snapshot: linkedMeta, revision: 3n, exportedRevision: null },
      { snapshot: targetWithChild, revision: 7n, exportedRevision: null },
      { snapshot: child, revision: 2n, exportedRevision: null },
    ]);
    const registry = createSpaceSessionRegistry(backend);
    registry.open({ snapshot: linkedMeta, revision: 3n, exportedRevision: null });
    const lifecycle = createSpaceCardLifecycle({
      backend,
      registry,
      newId: idSource([SECOND_SPACE_CARD_ID]),
    });

    await expect(
      lifecycle.link({
        containingSpaceId: META_ID,
        layoutId: META_LAYOUT_ID,
        targetSpaceId: TARGET_ID,
        title: 'Second link',
        position: { x: 480, y: 80 },
      }),
    ).resolves.toMatchObject({ kind: 'committed' });

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, cardId: SPACE_CARD_ID }),
    ).resolves.toMatchObject({ kind: 'committed', deletedSpaceIds: [] });
    expect(await backend.loadSpace(TARGET_ID)).toMatchObject({ revision: 7n });

    await expect(
      lifecycle.delete({ containingSpaceId: META_ID, cardId: SECOND_SPACE_CARD_ID }),
    ).resolves.toMatchObject({ kind: 'committed', deletedSpaceIds: [TARGET_ID, CHILD_ID] });
    expect(await backend.loadSpace(TARGET_ID)).toBeUndefined();
    expect(await backend.loadSpace(CHILD_ID)).toBeUndefined();
  });
});
