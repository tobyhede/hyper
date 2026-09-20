import { expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type Graph } from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import {
  snapshotFromSpace,
  updatePositionedMap,
  withResourceRemovedFromMaps,
} from '../src/snapshot';

const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
/** A Resource no Map in these fixtures places or connects. */
const UNHELD_RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

const MAIN: Graph = { id: GRAPH_ID, title: 'Main', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] };

/** One Map owning one Graph over both its Resources — the first-public shape (ADR 0040). */
const snapshot = spaceSnapshotSchema.parse({
  id: '00000000-0000-4000-8000-000000000001',
  document: {
    version: 1,
    title: 'Space',
    maps: [
      {
        id: MAP_ID,
        title: 'Map',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 0, y: 0, open: false },
          [RESOURCE_B]: { x: 200, y: 0, open: false },
        },
        graphs: [MAIN],
      },
    ],
  },
  // Declared in Title order, because intake sorts and `snapshotFromSpace` is
  // asserted to round-trip this array exactly. It used to read A-then-B: ADR
  // 0085 renamed the first one's Title, and `Next` now sorts ahead of `Resource`.
  resources: [
    { id: RESOURCE_B, document: { title: 'Next', kind: 'markdown', body: 'More' } },
    { id: RESOURCE_A, document: { title: 'Resource', kind: 'markdown', body: 'Body' } },
  ],
});

it('writes a Map that owns its Graphs as a complete valid persistence snapshot', () => {
  const changed = updatePositionedMap(snapshot, {
    mapId: MAP_ID,
    title: 'Map',
    positions: Placement.fromEntries([
      [RESOURCE_A, { x: 10, y: 20, open: false }],
      [RESOURCE_B, { x: 300, y: 40, open: false }],
    ]),
    graphs: [MAIN],
    activeGraphId: GRAPH_ID,
  });

  expect(changed.resources).toEqual(snapshot.resources);
  expect(changed.document.defaultMap).toBe(MAP_ID);
  expect(changed.document.maps).toEqual([
    {
      id: MAP_ID,
      title: 'Map',
      kind: 'positioned',
      positions: {
        [RESOURCE_A]: { x: 10, y: 20, open: false },
        [RESOURCE_B]: { x: 300, y: 40, open: false },
      },
      graphs: [MAIN],
      activeGraph: GRAPH_ID,
    },
  ]);
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});

/** A new Map owns its Graph; there is no Space-level Graph collection. */
it('appends a Map owning its own Graph without touching the other Maps', () => {
  const minted: Graph = { id: OTHER_GRAPH_ID, title: 'Graph 1', edges: [] };
  const changed = updatePositionedMap(snapshot, {
    mapId: OTHER_MAP_ID,
    title: 'Map 2',
    positions: Placement.fromEntries([[RESOURCE_A, { x: 1, y: 2, open: false }]]),
    graphs: [minted],
    activeGraphId: OTHER_GRAPH_ID,
  });

  expect(changed.document.maps).toHaveLength(2);
  expect(changed.document.maps?.[1]?.graphs).toEqual([minted]);
  expect(changed.document.maps?.[1]?.activeGraph).toBe(OTHER_GRAPH_ID);
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

it('leaves unrelated maps standing while replacing placement', () => {
  const withMaps = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      maps: [
        ...(snapshot.document.maps ?? []),
        {
          id: OTHER_MAP_ID,
          title: 'Other',
          kind: 'positioned',
          positions: { [RESOURCE_A]: { x: 0, y: 400, open: false } },
          graphs: [
            { id: OTHER_GRAPH_ID, title: 'Aside', edges: [{ from: RESOURCE_A, to: RESOURCE_A }] },
          ],
        },
      ],
    },
  });

  const changed = updatePositionedMap(withMaps, {
    mapId: MAP_ID,
    title: 'Map',
    positions: Placement.fromEntries([
      [RESOURCE_A, { x: 5, y: 6, open: false }],
      [RESOURCE_B, { x: 7, y: 8, open: false }],
    ]),
    graphs: [MAIN],
    activeGraphId: GRAPH_ID,
  });

  expect(changed.document.maps).toHaveLength(2);
  expect(changed.document.maps?.map((map) => map.id)).toEqual([MAP_ID, OTHER_MAP_ID]);
  expect(changed.document.maps?.[1]).toEqual(withMaps.document.maps?.[1]);
  expect(changed.resources).toEqual(snapshot.resources);
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});

/**
 * `activeGraph` is authored and the app has no surface for clearing one. An Edit
 * completed with no active Graph therefore has nothing to say about it, and must
 * leave what the author wrote alone rather than read its own silence as an
 * instruction to erase.
 */
it('leaves an authored active Graph alone when the Edit names none', () => {
  const changed = updatePositionedMap(snapshot, {
    mapId: MAP_ID,
    title: 'Map',
    positions: Placement.fromEntries([
      [RESOURCE_A, { x: 5, y: 6, open: false }],
      [RESOURCE_B, { x: 7, y: 8, open: false }],
    ]),
    graphs: [MAIN],
    activeGraphId: null,
  });

  expect(changed.document.maps?.[0]?.activeGraph).toBeUndefined();

  const authored = updatePositionedMap(
    updatePositionedMap(snapshot, {
      mapId: MAP_ID,
      title: 'Map',
      positions: Placement.fromEntries([
        [RESOURCE_A, { x: 5, y: 6, open: false }],
        [RESOURCE_B, { x: 7, y: 8, open: false }],
      ]),
      graphs: [MAIN],
      activeGraphId: GRAPH_ID,
    }),
    {
      mapId: MAP_ID,
      title: 'Map',
      positions: Placement.fromEntries([
        [RESOURCE_A, { x: 9, y: 9, open: false }],
        [RESOURCE_B, { x: 7, y: 8, open: false }],
      ]),
      graphs: [MAIN],
      activeGraphId: null,
    },
  );

  expect(authored.document.maps?.[0]?.activeGraph).toBe(GRAPH_ID);
  expect(loadSpaceSnapshot(authored).ok).toBe(true);
});

/**
 * Deleting a Resource from the Space is one Edit over every Map at once, and this
 * is the part of it no single-Map write can do: the Resource's membership and its
 * incident Edges leave every Map that held them, while empty Graphs and
 * Maps stay exactly where they were.
 */
it('cascades a deleted Resource out of every Map that held it', () => {
  const withMaps = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      maps: [
        ...(snapshot.document.maps ?? []),
        {
          id: OTHER_MAP_ID,
          title: 'Other',
          kind: 'positioned',
          positions: {
            [RESOURCE_A]: { x: 0, y: 400, open: false },
            [RESOURCE_B]: { x: 0, y: 600, open: false },
          },
          graphs: [
            {
              id: OTHER_GRAPH_ID,
              title: 'Aside',
              edges: [
                { from: RESOURCE_A, to: RESOURCE_A },
                { from: RESOURCE_B, to: RESOURCE_A },
              ],
            },
          ],
        },
      ],
    },
  });

  const changed = withResourceRemovedFromMaps(withMaps, RESOURCE_A);

  expect(changed.document.maps?.[0]?.positions).toEqual({
    [RESOURCE_B]: { x: 200, y: 0, open: false },
  });
  expect(changed.document.maps?.[0]?.graphs).toEqual([{ ...MAIN, edges: [] }]);
  expect(changed.document.maps?.[1]?.positions).toEqual({
    [RESOURCE_B]: { x: 0, y: 600, open: false },
  });
  expect(changed.document.maps?.[1]?.graphs).toEqual([
    { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] },
  ]);
  // The Resource itself is the caller's to remove: this answers only what the
  // Maps hold, so an intake over the result still names the Resource it lists.
  expect(changed.resources).toEqual(withMaps.resources);
});

it('answers the snapshot it was given when no Map held the Resource', () => {
  expect(withResourceRemovedFromMaps(snapshot, UNHELD_RESOURCE)).toBe(snapshot);
});

/**
 * The cascade half of Delete Resource from Space owes the reclaim the single-Map
 * half owes (ADR 0084). Under the derivation ADR 0084 removed, dropping a
 * Resource's entry dropped its displacement with it; now the room an Open Resource
 * holds is written into its neighbours' own coordinates, so a Map the Edit
 * is not drawing would keep that room forever — with no Resource left on that
 * canvas to Close and no Edit that could give it back.
 */
it('reclaims the room an Open Resource held in every Map it is deleted from', () => {
  // RESOURCE_A is Open at 800x600 in the second Map, so its growth of 540x454
  // is already written into RESOURCE_B's coordinates there. B is clear of A on `x`,
  // so it took the width alone (ADR 0093): (100, 100) + (540, 0).
  const withMaps = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      maps: [
        ...(snapshot.document.maps ?? []),
        {
          id: OTHER_MAP_ID,
          title: 'Other',
          kind: 'positioned',
          positions: {
            [RESOURCE_A]: { x: 0, y: 0, open: true, openSize: { width: 800, height: 600 } },
            [RESOURCE_B]: { x: 640, y: 100, open: false },
          },
          graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
        },
      ],
    },
  });

  const changed = withResourceRemovedFromMaps(withMaps, RESOURCE_A);

  expect(changed.document.maps?.[1]?.positions).toEqual({
    [RESOURCE_B]: { x: 100, y: 100, open: false },
  });
});
