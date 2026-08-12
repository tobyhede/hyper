import { expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type Graph } from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import {
  snapshotFromSpace,
  updatePositionedLayout,
  withCardRemovedFromLayouts,
} from '../src/snapshot';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');

const MAIN: Graph = { id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] };

/** One Layout owning one Graph over both its Cards — the first-public shape (ADR 0040). */
const snapshot = spaceSnapshotSchema.parse({
  id: '00000000-0000-4000-8000-000000000001',
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 0, y: 0 }, [CARD_B]: { x: 200, y: 0 } },
        graphs: [MAIN],
      },
    ],
  },
  cards: [
    { id: CARD_A, document: { title: 'Card', kind: 'markdown', body: 'Body' } },
    { id: CARD_B, document: { title: 'Next', kind: 'markdown', body: 'More' } },
  ],
});

it('writes a Layout that owns its Graphs as a complete valid persistence snapshot', () => {
  const changed = updatePositionedLayout(snapshot, {
    layoutId: LAYOUT_ID,
    title: 'Layout',
    positions: Placement.fromEntries([
      [CARD_A, { x: 10, y: 20 }],
      [CARD_B, { x: 300, y: 40 }],
    ]),
    graphs: [MAIN],
    activeGraphId: GRAPH_ID,
  });

  expect(changed.cards).toEqual(snapshot.cards);
  expect(changed.document.defaultView).toBe(LAYOUT_ID);
  expect(changed.document.layouts).toEqual([
    {
      id: LAYOUT_ID,
      title: 'Layout',
      kind: 'positioned',
      positions: { [CARD_A]: { x: 10, y: 20 }, [CARD_B]: { x: 300, y: 40 } },
      graphs: [MAIN],
      activeGraph: GRAPH_ID,
    },
  ]);
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});

/**
 * A Layout appended by a conversion carries the Graph that conversion minted, and
 * nothing about it reaches the Space: there is no Space-level collection left for
 * a Graph to be written to (ADR 0040).
 */
it('appends a converted Layout owning its own Graph without touching the Space', () => {
  const minted: Graph = { id: OTHER_GRAPH_ID, title: 'Graph 1', edges: [] };
  const changed = updatePositionedLayout(snapshot, {
    layoutId: OTHER_LAYOUT_ID,
    title: 'Layout 2',
    positions: Placement.fromEntries([[CARD_A, { x: 1, y: 2 }]]),
    graphs: [minted],
    activeGraphId: OTHER_GRAPH_ID,
  });

  expect(changed.document.layouts).toHaveLength(2);
  expect(changed.document.layouts?.[1]?.graphs).toEqual([minted]);
  expect(changed.document.layouts?.[1]?.activeGraph).toBe(OTHER_GRAPH_ID);
  expect(Object.hasOwn(changed.document, 'graphs')).toBe(false);
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});

it('converts the validated runtime aggregate back to the persistence seam', () => {
  const loaded = loadSpaceSnapshot(snapshot);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;

  expect(snapshotFromSpace(loaded.space)).toEqual(snapshot);
  expect(snapshotFromSpace(loaded.space).document.version).toBe(1);
});

it('leaves unrelated layouts standing while replacing placement', () => {
  const withLayouts = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      layouts: [
        ...(snapshot.document.layouts ?? []),
        {
          id: OTHER_LAYOUT_ID,
          title: 'Other',
          kind: 'positioned',
          positions: { [CARD_A]: { x: 0, y: 400 } },
          graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [{ from: CARD_A, to: CARD_A }] }],
        },
      ],
    },
  });

  const changed = updatePositionedLayout(withLayouts, {
    layoutId: LAYOUT_ID,
    title: 'Layout',
    positions: Placement.fromEntries([
      [CARD_A, { x: 5, y: 6 }],
      [CARD_B, { x: 7, y: 8 }],
    ]),
    graphs: [MAIN],
    activeGraphId: GRAPH_ID,
  });

  expect(changed.document.layouts).toHaveLength(2);
  expect(changed.document.layouts?.map((layout) => layout.id)).toEqual([
    LAYOUT_ID,
    OTHER_LAYOUT_ID,
  ]);
  expect(changed.document.layouts?.[1]).toEqual(withLayouts.document.layouts?.[1]);
  expect(changed.cards).toEqual(snapshot.cards);
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});

/**
 * `activeGraph` is authored and the app has no surface for clearing one. An Edit
 * completed with no active Graph therefore has nothing to say about it, and must
 * leave what the author wrote alone rather than read its own silence as an
 * instruction to erase.
 */
it('leaves an authored active Graph alone when the Edit names none', () => {
  const changed = updatePositionedLayout(snapshot, {
    layoutId: LAYOUT_ID,
    title: 'Layout',
    positions: Placement.fromEntries([
      [CARD_A, { x: 5, y: 6 }],
      [CARD_B, { x: 7, y: 8 }],
    ]),
    graphs: [MAIN],
    activeGraphId: null,
  });

  expect(changed.document.layouts?.[0]?.activeGraph).toBeUndefined();

  const authored = updatePositionedLayout(
    updatePositionedLayout(snapshot, {
      layoutId: LAYOUT_ID,
      title: 'Layout',
      positions: Placement.fromEntries([
        [CARD_A, { x: 5, y: 6 }],
        [CARD_B, { x: 7, y: 8 }],
      ]),
      graphs: [MAIN],
      activeGraphId: GRAPH_ID,
    }),
    {
      layoutId: LAYOUT_ID,
      title: 'Layout',
      positions: Placement.fromEntries([
        [CARD_A, { x: 9, y: 9 }],
        [CARD_B, { x: 7, y: 8 }],
      ]),
      graphs: [MAIN],
      activeGraphId: null,
    },
  );

  expect(authored.document.layouts?.[0]?.activeGraph).toBe(GRAPH_ID);
  expect(loadSpaceSnapshot(authored).ok).toBe(true);
});

/**
 * Deleting a Card from the Space is one Edit over every Layout at once, and this
 * is the part of it no single-Layout write can do: the Card's membership and its
 * incident Edges leave every Layout that held them, while empty Graphs and
 * Layouts stay exactly where they were.
 */
it('cascades a deleted Card out of every Layout that held it', () => {
  const withLayouts = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      layouts: [
        ...(snapshot.document.layouts ?? []),
        {
          id: OTHER_LAYOUT_ID,
          title: 'Other',
          kind: 'positioned',
          positions: { [CARD_A]: { x: 0, y: 400 }, [CARD_B]: { x: 0, y: 600 } },
          graphs: [
            {
              id: OTHER_GRAPH_ID,
              title: 'Aside',
              edges: [
                { from: CARD_A, to: CARD_A },
                { from: CARD_B, to: CARD_A },
              ],
            },
          ],
        },
      ],
    },
  });

  const changed = withCardRemovedFromLayouts(withLayouts, CARD_A);

  expect(changed.document.layouts?.[0]?.positions).toEqual({ [CARD_B]: { x: 200, y: 0 } });
  expect(changed.document.layouts?.[0]?.graphs).toEqual([{ ...MAIN, edges: [] }]);
  expect(changed.document.layouts?.[1]?.positions).toEqual({ [CARD_B]: { x: 0, y: 600 } });
  expect(changed.document.layouts?.[1]?.graphs).toEqual([
    { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] },
  ]);
  // The Card itself is the caller's to remove: this answers only what the
  // Layouts hold, so an intake over the result still names the Card it lists.
  expect(changed.cards).toEqual(withLayouts.cards);
});

it('answers the snapshot it was given when no Layout held the Card', () => {
  expect(withCardRemovedFromLayouts(snapshot, OTHER_LAYOUT_ID)).toBe(snapshot);
});
