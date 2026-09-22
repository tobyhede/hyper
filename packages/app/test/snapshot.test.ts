import { expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type Graph } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { snapshotFromSpace, updatePositionedMap } from '../src/snapshot';

const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');

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

/**
 * The helper writes a Map's identity, not its content: the Edit that changes
 * positions or Graphs has already written them into the snapshot, and this
 * must not put an older copy back over them.
 */
it("writes a Map's identity and opening selection, preserving its positions and Graphs", () => {
  const changed = updatePositionedMap(snapshot, {
    mapId: MAP_ID,
    title: 'Renamed',
    activeGraphId: GRAPH_ID,
  });

  expect(changed.resources).toEqual(snapshot.resources);
  expect(changed.document.defaultMap).toBe(MAP_ID);
  expect(changed.document.maps).toEqual([
    {
      id: MAP_ID,
      title: 'Renamed',
      kind: 'positioned',
      positions: {
        [RESOURCE_A]: { x: 0, y: 0, open: false },
        [RESOURCE_B]: { x: 200, y: 0, open: false },
      },
      graphs: [MAIN],
      activeGraph: GRAPH_ID,
    },
  ]);
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});

/** Creating a Map is the `created-map` Edit's own statement, not a side effect of an id. */
it('refuses to write a Map the snapshot does not hold', () => {
  expect(() =>
    updatePositionedMap(snapshot, {
      mapId: OTHER_MAP_ID,
      title: 'Map 2',
      activeGraphId: OTHER_GRAPH_ID,
    }),
  ).toThrow(OTHER_MAP_ID);
});

it('converts the validated runtime aggregate back to the persistence seam', () => {
  const loaded = loadSpaceSnapshot(snapshot);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;

  expect(snapshotFromSpace(loaded.space)).toEqual(snapshot);
  expect(snapshotFromSpace(loaded.space).document.version).toBe(1);
});

it('leaves unrelated maps standing while writing one', () => {
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
    activeGraphId: null,
  });

  expect(changed.document.maps?.[0]?.activeGraph).toBeUndefined();

  const authored = updatePositionedMap(
    updatePositionedMap(snapshot, { mapId: MAP_ID, title: 'Map', activeGraphId: GRAPH_ID }),
    { mapId: MAP_ID, title: 'Map', activeGraphId: null },
  );

  expect(authored.document.maps?.[0]?.activeGraph).toBe(GRAPH_ID);
  expect(loadSpaceSnapshot(authored).ok).toBe(true);
});
