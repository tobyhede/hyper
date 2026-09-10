import { expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type Graph } from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import {
  snapshotFromSpace,
  updatePositionedDiagram,
  withCardRemovedFromDiagrams,
} from '../src/snapshot';

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
/** A Card no Diagram in these fixtures places or connects. */
const UNHELD_CARD = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const MAIN: Graph = { id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] };

/** One Diagram owning one Graph over both its Cards — the first-public shape (ADR 0040). */
const snapshot = spaceSnapshotSchema.parse({
  id: '00000000-0000-4000-8000-000000000001',
  document: {
    version: 1,
    title: 'Space',
    diagrams: [
      {
        id: DIAGRAM_ID,
        title: 'Diagram',
        kind: 'positioned',
        positions: {
          [CARD_A]: { x: 0, y: 0, open: false },
          [CARD_B]: { x: 200, y: 0, open: false },
        },
        graphs: [MAIN],
      },
    ],
  },
  cards: [
    { id: CARD_A, document: { title: 'Card', kind: 'markdown', body: 'Body' } },
    { id: CARD_B, document: { title: 'Next', kind: 'markdown', body: 'More' } },
  ],
});

it('writes a Diagram that owns its Graphs as a complete valid persistence snapshot', () => {
  const changed = updatePositionedDiagram(snapshot, {
    diagramId: DIAGRAM_ID,
    title: 'Diagram',
    positions: Placement.fromEntries([
      [CARD_A, { x: 10, y: 20, open: false }],
      [CARD_B, { x: 300, y: 40, open: false }],
    ]),
    graphs: [MAIN],
    activeGraphId: GRAPH_ID,
  });

  expect(changed.cards).toEqual(snapshot.cards);
  expect(changed.document.defaultDiagram).toBe(DIAGRAM_ID);
  expect(changed.document.diagrams).toEqual([
    {
      id: DIAGRAM_ID,
      title: 'Diagram',
      kind: 'positioned',
      positions: {
        [CARD_A]: { x: 10, y: 20, open: false },
        [CARD_B]: { x: 300, y: 40, open: false },
      },
      graphs: [MAIN],
      activeGraph: GRAPH_ID,
    },
  ]);
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});

/** A new Diagram owns its Graph; there is no Space-level Graph collection. */
it('appends a Diagram owning its own Graph without touching the other Diagrams', () => {
  const minted: Graph = { id: OTHER_GRAPH_ID, title: 'Graph 1', edges: [] };
  const changed = updatePositionedDiagram(snapshot, {
    diagramId: OTHER_DIAGRAM_ID,
    title: 'Diagram 2',
    positions: Placement.fromEntries([[CARD_A, { x: 1, y: 2, open: false }]]),
    graphs: [minted],
    activeGraphId: OTHER_GRAPH_ID,
  });

  expect(changed.document.diagrams).toHaveLength(2);
  expect(changed.document.diagrams?.[1]?.graphs).toEqual([minted]);
  expect(changed.document.diagrams?.[1]?.activeGraph).toBe(OTHER_GRAPH_ID);
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

it('leaves unrelated diagrams standing while replacing placement', () => {
  const withDiagrams = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      diagrams: [
        ...(snapshot.document.diagrams ?? []),
        {
          id: OTHER_DIAGRAM_ID,
          title: 'Other',
          kind: 'positioned',
          positions: { [CARD_A]: { x: 0, y: 400, open: false } },
          graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [{ from: CARD_A, to: CARD_A }] }],
        },
      ],
    },
  });

  const changed = updatePositionedDiagram(withDiagrams, {
    diagramId: DIAGRAM_ID,
    title: 'Diagram',
    positions: Placement.fromEntries([
      [CARD_A, { x: 5, y: 6, open: false }],
      [CARD_B, { x: 7, y: 8, open: false }],
    ]),
    graphs: [MAIN],
    activeGraphId: GRAPH_ID,
  });

  expect(changed.document.diagrams).toHaveLength(2);
  expect(changed.document.diagrams?.map((diagram) => diagram.id)).toEqual([
    DIAGRAM_ID,
    OTHER_DIAGRAM_ID,
  ]);
  expect(changed.document.diagrams?.[1]).toEqual(withDiagrams.document.diagrams?.[1]);
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
  const changed = updatePositionedDiagram(snapshot, {
    diagramId: DIAGRAM_ID,
    title: 'Diagram',
    positions: Placement.fromEntries([
      [CARD_A, { x: 5, y: 6, open: false }],
      [CARD_B, { x: 7, y: 8, open: false }],
    ]),
    graphs: [MAIN],
    activeGraphId: null,
  });

  expect(changed.document.diagrams?.[0]?.activeGraph).toBeUndefined();

  const authored = updatePositionedDiagram(
    updatePositionedDiagram(snapshot, {
      diagramId: DIAGRAM_ID,
      title: 'Diagram',
      positions: Placement.fromEntries([
        [CARD_A, { x: 5, y: 6, open: false }],
        [CARD_B, { x: 7, y: 8, open: false }],
      ]),
      graphs: [MAIN],
      activeGraphId: GRAPH_ID,
    }),
    {
      diagramId: DIAGRAM_ID,
      title: 'Diagram',
      positions: Placement.fromEntries([
        [CARD_A, { x: 9, y: 9, open: false }],
        [CARD_B, { x: 7, y: 8, open: false }],
      ]),
      graphs: [MAIN],
      activeGraphId: null,
    },
  );

  expect(authored.document.diagrams?.[0]?.activeGraph).toBe(GRAPH_ID);
  expect(loadSpaceSnapshot(authored).ok).toBe(true);
});

/**
 * Deleting a Card from the Space is one Edit over every Diagram at once, and this
 * is the part of it no single-Diagram write can do: the Card's membership and its
 * incident Edges leave every Diagram that held them, while empty Graphs and
 * Diagrams stay exactly where they were.
 */
it('cascades a deleted Card out of every Diagram that held it', () => {
  const withDiagrams = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      diagrams: [
        ...(snapshot.document.diagrams ?? []),
        {
          id: OTHER_DIAGRAM_ID,
          title: 'Other',
          kind: 'positioned',
          positions: {
            [CARD_A]: { x: 0, y: 400, open: false },
            [CARD_B]: { x: 0, y: 600, open: false },
          },
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

  const changed = withCardRemovedFromDiagrams(withDiagrams, CARD_A);

  expect(changed.document.diagrams?.[0]?.positions).toEqual({
    [CARD_B]: { x: 200, y: 0, open: false },
  });
  expect(changed.document.diagrams?.[0]?.graphs).toEqual([{ ...MAIN, edges: [] }]);
  expect(changed.document.diagrams?.[1]?.positions).toEqual({
    [CARD_B]: { x: 0, y: 600, open: false },
  });
  expect(changed.document.diagrams?.[1]?.graphs).toEqual([
    { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] },
  ]);
  // The Card itself is the caller's to remove: this answers only what the
  // Diagrams hold, so an intake over the result still names the Card it lists.
  expect(changed.cards).toEqual(withDiagrams.cards);
});

it('answers the snapshot it was given when no Diagram held the Card', () => {
  expect(withCardRemovedFromDiagrams(snapshot, UNHELD_CARD)).toBe(snapshot);
});

/**
 * The cascade half of Delete Card from Space owes the reclaim the single-Diagram
 * half owes (ADR 0084). Under the derivation ADR 0084 removed, dropping a
 * Card's entry dropped its displacement with it; now the room an Open Card
 * holds is written into its neighbours' own coordinates, so a Diagram the Edit
 * is not drawing would keep that room forever — with no Card left on that
 * canvas to Close and no Edit that could give it back.
 */
it('reclaims the room an Open Card held in every Diagram it is deleted from', () => {
  // CARD_A is Open at 800x600 in the second Diagram, so its growth of 540x454
  // is already written into CARD_B's coordinates there: (100, 100) + (540, 454).
  const withDiagrams = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      diagrams: [
        ...(snapshot.document.diagrams ?? []),
        {
          id: OTHER_DIAGRAM_ID,
          title: 'Other',
          kind: 'positioned',
          positions: {
            [CARD_A]: { x: 0, y: 0, open: true, openSize: { width: 800, height: 600 } },
            [CARD_B]: { x: 640, y: 554, open: false },
          },
          graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
        },
      ],
    },
  });

  const changed = withCardRemovedFromDiagrams(withDiagrams, CARD_A);

  expect(changed.document.diagrams?.[1]?.positions).toEqual({
    [CARD_B]: { x: 100, y: 100, open: false },
  });
});
