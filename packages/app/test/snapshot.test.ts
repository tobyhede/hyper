import { expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type Graph } from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import {
  snapshotFromSpace,
  updatePositionedDiagram,
  withThingRemovedFromDiagrams,
} from '../src/snapshot';

const THING_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const THING_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
/** A Thing no Diagram in these fixtures places or connects. */
const UNHELD_THING = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const MAIN: Graph = { id: GRAPH_ID, title: 'Main', edges: [{ from: THING_A, to: THING_B }] };

/** One Diagram owning one Graph over both its Things — the first-public shape (ADR 0040). */
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
          [THING_A]: { x: 0, y: 0, open: false },
          [THING_B]: { x: 200, y: 0, open: false },
        },
        graphs: [MAIN],
      },
    ],
  },
  // Declared in Title order, because intake sorts and `snapshotFromSpace` is
  // asserted to round-trip this array exactly. It used to read A-then-B: ADR
  // 0085 renamed the first one's Title, and `Next` now sorts ahead of `Thing`.
  things: [
    { id: THING_B, document: { title: 'Next', kind: 'markdown', body: 'More' } },
    { id: THING_A, document: { title: 'Thing', kind: 'markdown', body: 'Body' } },
  ],
});

it('writes a Diagram that owns its Graphs as a complete valid persistence snapshot', () => {
  const changed = updatePositionedDiagram(snapshot, {
    diagramId: DIAGRAM_ID,
    title: 'Diagram',
    positions: Placement.fromEntries([
      [THING_A, { x: 10, y: 20, open: false }],
      [THING_B, { x: 300, y: 40, open: false }],
    ]),
    graphs: [MAIN],
    activeGraphId: GRAPH_ID,
  });

  expect(changed.things).toEqual(snapshot.things);
  expect(changed.document.defaultDiagram).toBe(DIAGRAM_ID);
  expect(changed.document.diagrams).toEqual([
    {
      id: DIAGRAM_ID,
      title: 'Diagram',
      kind: 'positioned',
      positions: {
        [THING_A]: { x: 10, y: 20, open: false },
        [THING_B]: { x: 300, y: 40, open: false },
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
    positions: Placement.fromEntries([[THING_A, { x: 1, y: 2, open: false }]]),
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
          positions: { [THING_A]: { x: 0, y: 400, open: false } },
          graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [{ from: THING_A, to: THING_A }] }],
        },
      ],
    },
  });

  const changed = updatePositionedDiagram(withDiagrams, {
    diagramId: DIAGRAM_ID,
    title: 'Diagram',
    positions: Placement.fromEntries([
      [THING_A, { x: 5, y: 6, open: false }],
      [THING_B, { x: 7, y: 8, open: false }],
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
  expect(changed.things).toEqual(snapshot.things);
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
      [THING_A, { x: 5, y: 6, open: false }],
      [THING_B, { x: 7, y: 8, open: false }],
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
        [THING_A, { x: 5, y: 6, open: false }],
        [THING_B, { x: 7, y: 8, open: false }],
      ]),
      graphs: [MAIN],
      activeGraphId: GRAPH_ID,
    }),
    {
      diagramId: DIAGRAM_ID,
      title: 'Diagram',
      positions: Placement.fromEntries([
        [THING_A, { x: 9, y: 9, open: false }],
        [THING_B, { x: 7, y: 8, open: false }],
      ]),
      graphs: [MAIN],
      activeGraphId: null,
    },
  );

  expect(authored.document.diagrams?.[0]?.activeGraph).toBe(GRAPH_ID);
  expect(loadSpaceSnapshot(authored).ok).toBe(true);
});

/**
 * Deleting a Thing from the Space is one Edit over every Diagram at once, and this
 * is the part of it no single-Diagram write can do: the Thing's membership and its
 * incident Edges leave every Diagram that held them, while empty Graphs and
 * Diagrams stay exactly where they were.
 */
it('cascades a deleted Thing out of every Diagram that held it', () => {
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
            [THING_A]: { x: 0, y: 400, open: false },
            [THING_B]: { x: 0, y: 600, open: false },
          },
          graphs: [
            {
              id: OTHER_GRAPH_ID,
              title: 'Aside',
              edges: [
                { from: THING_A, to: THING_A },
                { from: THING_B, to: THING_A },
              ],
            },
          ],
        },
      ],
    },
  });

  const changed = withThingRemovedFromDiagrams(withDiagrams, THING_A);

  expect(changed.document.diagrams?.[0]?.positions).toEqual({
    [THING_B]: { x: 200, y: 0, open: false },
  });
  expect(changed.document.diagrams?.[0]?.graphs).toEqual([{ ...MAIN, edges: [] }]);
  expect(changed.document.diagrams?.[1]?.positions).toEqual({
    [THING_B]: { x: 0, y: 600, open: false },
  });
  expect(changed.document.diagrams?.[1]?.graphs).toEqual([
    { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] },
  ]);
  // The Thing itself is the caller's to remove: this answers only what the
  // Diagrams hold, so an intake over the result still names the Thing it lists.
  expect(changed.things).toEqual(withDiagrams.things);
});

it('answers the snapshot it was given when no Diagram held the Thing', () => {
  expect(withThingRemovedFromDiagrams(snapshot, UNHELD_THING)).toBe(snapshot);
});

/**
 * The cascade half of Delete Thing from Space owes the reclaim the single-Diagram
 * half owes (ADR 0084). Under the derivation ADR 0084 removed, dropping a
 * Thing's entry dropped its displacement with it; now the room an Open Thing
 * holds is written into its neighbours' own coordinates, so a Diagram the Edit
 * is not drawing would keep that room forever — with no Thing left on that
 * canvas to Close and no Edit that could give it back.
 */
it('reclaims the room an Open Thing held in every Diagram it is deleted from', () => {
  // THING_A is Open at 800x600 in the second Diagram, so its growth of 540x454
  // is already written into THING_B's coordinates there: (100, 100) + (540, 454).
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
            [THING_A]: { x: 0, y: 0, open: true, openSize: { width: 800, height: 600 } },
            [THING_B]: { x: 640, y: 554, open: false },
          },
          graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
        },
      ],
    },
  });

  const changed = withThingRemovedFromDiagrams(withDiagrams, THING_A);

  expect(changed.document.diagrams?.[1]?.positions).toEqual({
    [THING_B]: { x: 100, y: 100, open: false },
  });
});
