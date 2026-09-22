import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_OPEN_SIZE,
  uuidSchema,
  type Graph,
  type MapId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { GRAPH_PALETTE } from '../src/colors';
import { composeApp } from '../src/compose-app';

import { mintingIds } from './minting';

/**
 * The semantic operations Space Authoring gained for the complete Resource and
 * Graph authoring experience, asserted through the interface that owns them.
 *
 * Every case here is a row of the handoff's domain transition matrix: what one
 * completed Edit writes, what creating a Map does to it, and the
 * invariant or no-op that row names. Deliberately separate from
 * `space-authoring.test.ts`, which owns the lifecycle around a completion —
 * ordering, the install gate, persistence and replacement — rather than the
 * transitions themselves.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const RESOURCE_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const MINTED = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
/** The second identity an Edit mints, for the tests that create twice. */
const SECOND_MINTED = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
/** A Graph identity minted by Map creation. */
const MINTED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
/** What a second Map creation would mint. */
const UNKNOWN_RESOURCE = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
const UNKNOWN_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000098');
/**
 * What a Space Resource pointed at a Space these tests never load selects (ADR 0079).
 *
 * Every Space Resource names a Map of its target and a Graph that Map owns,
 * so there is no Space Resource here with nothing chosen. Whether the pair resolves
 * is the whole aggregate's question and not this seam's: single-Space intake
 * holds one Space, so a target outside it supplies nothing to check these
 * against, which is why they can be ids and nothing more.
 */
const UNLOADED_MAP = uuidSchema.parse('00000000-0000-4000-8000-000000000097');
const UNLOADED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000096');

const CENTRE = { x: 400, y: 300, open: false };

const MAIN_GRAPH: Graph = {
  id: GRAPH_ID,
  title: 'Main',
  edges: [{ from: RESOURCE_A, to: RESOURCE_B }],
};

/** A Space with no Maps, and so with no Graphs at all (ADR 0040). */
const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'Space' },
  resources: [
    { id: RESOURCE_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: RESOURCE_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

/** One Map placing both Resources and owning the Graph over them. */
const positionedSnapshot: SpaceSnapshot = {
  ...automaticSnapshot,
  document: {
    ...automaticSnapshot.document,
    maps: [
      {
        id: MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [RESOURCE_A]: { x: 10, y: 20, open: false },
          [RESOURCE_B]: { x: 300, y: 40, open: false },
        },
        graphs: [MAIN_GRAPH],
      },
    ],
    defaultMap: MAP_ID,
  },
};

const graphsOf = (snapshot: SpaceSnapshot): readonly Graph[] =>
  (snapshot.document.maps ?? []).flatMap((map) => map.graphs);

const mapOf = (snapshot: SpaceSnapshot, mapId: string) =>
  (snapshot.document.maps ?? []).find((map) => map.id === mapId);

function open(
  snapshot: SpaceSnapshot = positionedSnapshot,
  mapId: MapId = MAP_ID,
  // The ids this Edit will mint, named by the test that asserts on them rather
  // than taken from the ambient generator (ADR 0016, and `./minting`).
  newId: () => UUID = mintingIds(MINTED),
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(MemorySpaceBackend.asMeta(loaded), loaded);
  const { navigation, authoring } = composeApp({
    spaceSession: session,
    selection: mapId,
    newId,
  });
  return { session, navigation, authoring };
}

const openPositioned = (newId?: () => UUID) =>
  newId === undefined ? open() : open(positionedSnapshot, undefined, newId);

describe('Add Map', () => {
  it('creates and selects an empty Map with one empty Active Graph', () => {
    const { authoring, navigation, session } = open(
      positionedSnapshot,
      MAP_ID,
      mintingIds(MINTED, MINTED_GRAPH),
    );
    expect(authoring.complete({ kind: 'created-map' })).toEqual({ kind: 'completed' });

    expect(session.getState().working.document.maps).toEqual([
      positionedSnapshot.document.maps![0],
      {
        id: MINTED,
        title: 'Map 2',
        kind: 'positioned',
        positions: {},
        graphs: [
          {
            id: MINTED_GRAPH,
            title: 'Graph 1',
            color: GRAPH_PALETTE[0],
            edges: [],
          },
        ],
        activeGraph: MINTED_GRAPH,
      },
    ]);
    expect(session.getState().working.document.defaultMap).toBe(MINTED);
    // A new Map owns its Graph; there is no Space-level Graph collection.
    expect(Object.hasOwn(session.getState().working.document, 'graphs')).toBe(false);
    expect(navigation.getState().selectedMapId).toBe(MINTED);
  });

  it('does not require the current canvas placement to resolve', () => {
    const { authoring, navigation, session } = open(
      positionedSnapshot,
      MAP_ID,
      mintingIds(MINTED, MINTED_GRAPH),
    );

    expect(authoring.complete({ kind: 'created-map' })).toEqual({ kind: 'completed' });
    expect(session.getState().working.document.maps).toHaveLength(2);
    expect(navigation.getState().selectedMapId).toBe(MINTED);
  });
});

describe('Add Resource', () => {
  it('creates one neutrally titled detached Resource at the anchor it was given', () => {
    const { authoring, session } = openPositioned();

    expect(authoring.complete({ kind: 'created-resource', anchor: CENTRE })).toEqual({
      kind: 'completed',
      createdResourceId: MINTED,
    });

    expect(session.getState().working.resources[2]).toEqual({
      id: MINTED,
      document: { title: 'Resource 1', kind: 'markdown', body: '' },
    });
    expect(mapOf(session.getState().working, MAP_ID)?.positions).toEqual({
      [RESOURCE_A]: { x: 10, y: 20, open: false },
      [RESOURCE_B]: { x: 300, y: 40, open: false },
      [MINTED]: CENTRE,
    });
    // No Edge, and no second Graph: Add Resource adds neither (ADR 0040).
    expect(graphsOf(session.getState().working)).toEqual([MAIN_GRAPH]);
  });

  it('steps off an anchor another Resource already occupies rather than stacking exactly', () => {
    // Two creations, so two ids. The old global mock answered both with one
    // constant and the duplicate went unnoticed; naming them is what makes the
    // second creation a real one.
    const { authoring, session } = openPositioned(mintingIds(MINTED, SECOND_MINTED));

    authoring.complete({ kind: 'created-resource', anchor: CENTRE });
    authoring.complete({ kind: 'created-resource', anchor: CENTRE });

    const positions = mapOf(session.getState().working, MAP_ID)?.positions ?? {};
    const stacked = Object.values(positions).filter(
      (at) => at !== undefined && at.x >= CENTRE.x && at.y >= CENTRE.y,
    );
    // A visible stack, not collision avoidance: the first Resource never moves, and
    // the second takes one small diagonal step off it.
    expect(stacked).toEqual([CENTRE, { x: CENTRE.x + 24, y: CENTRE.y + 24, open: false }]);
  });

  it('stores the canvas anchor as authored, whatever else is Open', () => {
    const expandedSnapshot: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        maps: [
          {
            ...positionedSnapshot.document.maps![0]!,
            positions: {
              [RESOURCE_A]: { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } },
              [RESOURCE_B]: { x: 300, y: 40, open: false },
            },
          },
        ],
      },
    };
    const { authoring, session } = open(expandedSnapshot);

    authoring.complete({ kind: 'created-resource', anchor: { x: 500, y: 400 } });

    // A canvas coordinate is an authored one: A being Open moved its neighbours
    // when the Edit that opened it ran, and nothing converts a drop point on the
    // way in any more (ADR 0084). The Resource lands where it was dropped.
    expect(mapOf(session.getState().working, MAP_ID)?.positions[MINTED]).toEqual({
      x: 500,
      y: 400,
      open: false,
    });
  });
});

describe('Edit Resource', () => {
  /**
   * A blank title is refused *at the interface*, not only at the field that
   * typed it. Intake rejects an empty title, and this derivation reports an
   * unloadable Space by throwing — so without this the author's own mistake
   * arrives as an exception, which the transient-authoring contract forbids.
   */
  it('refuses an empty Resource title rather than throwing on intake', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'edited-resource',
        resourceId: RESOURCE_A,
        document: { title: '', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'resource-title-required' } });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a title that is only whitespace, which the schema would accept', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    // `z.string().min(1)` counts characters and a space is one, so this would
    // be stored and draw as a Resource with no name at all.
    expect(
      authoring.complete({
        kind: 'edited-resource',
        resourceId: RESOURCE_A,
        document: { title: '   ', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'resource-title-required' } });
    expect(session.getState().working).toBe(before);
  });

  it('normalizes a Title as the schema does, and reads one that only gained padding as unchanged', () => {
    const { authoring, session } = openPositioned();

    // The interior line's trailing whitespace is the case that tells the two
    // rules apart: a whole-string trim leaves it, and the schema does not, so
    // the write path taking the trim would store a Title intake would not mint.
    expect(
      authoring.complete({
        kind: 'edited-resource',
        resourceId: RESOURCE_A,
        document: { title: 'Renamed  \nA subtitle   ', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({ kind: 'completed' });
    expect(session.getState().working.resources[0]?.document.title).toBe('Renamed\nA subtitle');

    // "Renaming a Title to the same Title plus a trailing newline is therefore
    // unchanged rather than an Edit" (ADR 0083).
    expect(
      authoring.complete({
        kind: 'edited-resource',
        resourceId: RESOURCE_A,
        document: { title: 'Renamed\nA subtitle\n', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({ kind: 'unchanged' });
  });
});

describe('Expanded Resource geometry', () => {
  it('restores a resized Open Size after Closing and Opening again', () => {
    const { authoring, session } = openPositioned();

    expect(authoring.complete({ kind: 'opened-resource', resourceId: RESOURCE_A })).toEqual({
      kind: 'completed',
    });
    expect(
      authoring.complete({
        kind: 'resized-resource',
        resourceId: RESOURCE_A,
        size: { width: 640, height: 480 },
      }),
    ).toEqual({ kind: 'completed' });
    expect(authoring.complete({ kind: 'closed-resource', resourceId: RESOURCE_A })).toEqual({
      kind: 'completed',
    });
    expect(mapOf(session.getState().working, MAP_ID)?.positions[RESOURCE_A]).toEqual({
      x: 10,
      y: 20,
      open: false,
      openSize: { width: 640, height: 480 },
    });

    expect(authoring.complete({ kind: 'opened-resource', resourceId: RESOURCE_A })).toEqual({
      kind: 'completed',
    });
    expect(mapOf(session.getState().working, MAP_ID)?.positions[RESOURCE_A]).toEqual({
      x: 10,
      y: 20,
      open: true,
      openSize: { width: 640, height: 480 },
    });
  });

  it('Closes at the exact Closed rect without replacing the remembered Open Size', () => {
    const { authoring, session } = openPositioned();

    expect(authoring.complete({ kind: 'opened-resource', resourceId: RESOURCE_A })).toEqual({
      kind: 'completed',
    });
    expect(
      authoring.complete({
        kind: 'resized-resource',
        resourceId: RESOURCE_A,
        size: { width: 640, height: 480 },
      }),
    ).toEqual({ kind: 'completed' });

    expect(
      authoring.complete({
        kind: 'resized-resource',
        resourceId: RESOURCE_A,
        size: { width: 260, height: 146 },
      }),
    ).toEqual({ kind: 'completed' });
    expect(mapOf(session.getState().working, MAP_ID)?.positions[RESOURCE_A]).toEqual({
      x: 10,
      y: 20,
      open: false,
      openSize: { width: 640, height: 480 },
    });
  });

  it('refuses a stale resize completion for a Resource that is no longer Expanded', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'resized-resource',
        resourceId: RESOURCE_A,
        size: { width: 560, height: 420 },
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'resource-not-expanded' } });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a subject the Map does not hold and moves nobody', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'opened-resource', resourceId: UNKNOWN_RESOURCE })).toEqual({
      kind: 'refused',
      refusal: { code: 'resource-not-in-map' },
    });
    expect(authoring.complete({ kind: 'closed-resource', resourceId: UNKNOWN_RESOURCE })).toEqual({
      kind: 'refused',
      refusal: { code: 'resource-not-in-map' },
    });
    expect(session.getState().working).toBe(before);
  });

  it('is unchanged and moves nobody when the proposal is the size the Resource already has', () => {
    const { authoring, session } = openPositioned();
    authoring.complete({ kind: 'opened-resource', resourceId: RESOURCE_A });
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'resized-resource',
        resourceId: RESOURCE_A,
        size: DEFAULT_OPEN_SIZE,
      }),
    ).toEqual({ kind: 'unchanged' });
    expect(session.getState().working).toBe(before);
  });
});

describe('Add Reference Resource', () => {
  it('creates and places a Reference Resource on its Target, minting a neutral title when none was typed', () => {
    const { authoring, session } = openPositioned();

    expect(
      authoring.complete({ kind: 'created-reference', target: RESOURCE_A, anchor: CENTRE }),
    ).toEqual({
      kind: 'completed',
      createdResourceId: MINTED,
    });

    // The Target's own Title is never copied: a Reference Resource that arrived already
    // named after its Target gave the Space two Resources with one name by default.
    expect(session.getState().working.resources[2]).toEqual({
      id: MINTED,
      document: { title: 'Resource 1', kind: 'reference', target: RESOURCE_A },
    });
    expect(mapOf(session.getState().working, MAP_ID)?.positions[MINTED]).toEqual(CENTRE);
  });

  /**
   * Normalized as the schema normalizes it, not trimmed as a whole string.
   *
   * A Title is Title Lines, so a first line's leading whitespace is that line's
   * own and an interior line's trailing whitespace is out of a whole-string
   * trim's reach (ADR 0083). Creation and renaming write the same field, so the
   * same author bytes have to reach the same stored document whichever path
   * wrote them — the rename path already asks `normalizeTitle`.
   */
  it('keeps a title the author already entered, normalized the way a rename is', () => {
    const { authoring, session } = openPositioned();

    authoring.complete({
      kind: 'created-reference',
      target: RESOURCE_A,
      title: '  Recap  \n  the week  ',
      anchor: CENTRE,
    });

    expect(session.getState().working.resources[2]?.document).toEqual({
      title: '  Recap\n  the week',
      kind: 'reference',
      target: RESOURCE_A,
    });
  });

  it('refuses a Target that is itself a Reference Resource, so no chain is ever authored', () => {
    const referenced: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        positionedSnapshot.resources[0]!,
        { id: RESOURCE_B, document: { title: 'A again', kind: 'reference', target: RESOURCE_A } },
      ],
    };
    const { authoring, session } = open(referenced);
    const before = session.getState().working;

    expect(
      authoring.complete({ kind: 'created-reference', target: RESOURCE_B, anchor: CENTRE }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'reference-target-must-own-content', targetId: RESOURCE_B },
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a Target the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'created-reference', target: UNKNOWN_RESOURCE, anchor: CENTRE }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'reference-target-not-found', targetId: UNKNOWN_RESOURCE },
    });
  });
});

describe('Add Graph', () => {
  it('rotates colour by its appended position in the owning Map', () => {
    const snapshot: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        maps: [
          positionedSnapshot.document.maps![0]!,
          {
            id: OTHER_MAP_ID,
            title: 'Map 2',
            kind: 'positioned',
            positions: {
              [RESOURCE_A]: { x: 20, y: 30, open: false },
              [RESOURCE_B]: { x: 310, y: 50, open: false },
            },
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Other', edges: [] }],
          },
        ],
      },
    };
    const { authoring, session } = open(snapshot);

    expect(authoring.complete({ kind: 'added-graph' })).toEqual({
      kind: 'completed',
      createdGraphId: MINTED,
    });

    expect(mapOf(session.getState().working, MAP_ID)?.graphs.at(-1)?.color).toBe(GRAPH_PALETTE[1]);
  });

  it('appends, colours and activates one empty Graph without touching the others', () => {
    const { authoring, session, navigation } = openPositioned();

    expect(authoring.complete({ kind: 'added-graph' })).toEqual({
      kind: 'completed',
      createdGraphId: MINTED,
    });

    expect(graphsOf(session.getState().working)).toEqual([
      MAIN_GRAPH,
      { id: MINTED, title: 'Graph 1', color: GRAPH_PALETTE[1], edges: [] },
    ]);
    expect(mapOf(session.getState().working, MAP_ID)?.activeGraph).toBe(MINTED);
    expect(navigation.getState().activeGraphId).toBe(MINTED);
    expect(session.getState().working.resources).toEqual(positionedSnapshot.resources);
  });

  it('is literal and repeatable, so an already empty active Graph does not swallow it', () => {
    const { authoring, session } = openPositioned(mintingIds(MINTED, SECOND_MINTED));

    authoring.complete({ kind: 'added-graph' });
    authoring.complete({ kind: 'added-graph' });

    expect(graphsOf(session.getState().working).map((graph) => graph.title)).toEqual([
      'Main',
      'Graph 1',
      'Graph 2',
    ]);
  });
});

describe('Edit Graph', () => {
  it('replaces a Graph title', () => {
    const { authoring, session } = openPositioned();

    expect(
      authoring.complete({ kind: 'renamed-graph', graphId: GRAPH_ID, title: '  Deep dive  ' }),
    ).toEqual({ kind: 'completed' });
    expect(graphsOf(session.getState().working)[0]?.title).toBe('Deep dive');
  });

  it('refuses an empty Graph title and leaves the stored one alone', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'renamed-graph', graphId: GRAPH_ID, title: '   ' })).toEqual({
      kind: 'refused',
      refusal: { code: 'graph-title-required' },
    });
    expect(session.getState().working).toBe(before);
  });

  it('treats a padded rename to the stored title as unchanged', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({ kind: 'renamed-graph', graphId: GRAPH_ID, title: ' Main ' }),
    ).toEqual({ kind: 'unchanged' });
    expect(session.getState().working).toBe(before);
  });

  it('stores a chosen colour and treats the current swatch as unchanged', () => {
    const { authoring, session } = openPositioned();

    expect(
      authoring.complete({ kind: 'recolored-graph', graphId: GRAPH_ID, color: GRAPH_PALETTE[3] }),
    ).toEqual({ kind: 'completed' });
    expect(graphsOf(session.getState().working)[0]?.color).toBe(GRAPH_PALETTE[3]);

    expect(
      authoring.complete({ kind: 'recolored-graph', graphId: GRAPH_ID, color: GRAPH_PALETTE[3] }),
    ).toEqual({ kind: 'unchanged' });
  });
});

describe('Rename Map', () => {
  it('trims and replaces only the Map title', () => {
    const { authoring, session } = openPositioned();
    const before = mapOf(session.getState().working, MAP_ID);

    expect(
      authoring.complete({ kind: 'renamed-map', mapId: MAP_ID, title: '  Workshop  ' }),
    ).toEqual({
      kind: 'completed',
    });
    const after = mapOf(session.getState().working, MAP_ID);
    expect(after?.title).toBe('Workshop');
    expect(after?.id).toBe(before?.id);
    expect(after?.positions).toEqual(before?.positions);
    expect(after?.graphs).toEqual(before?.graphs);
  });

  it('refuses a blank title and treats the stored title with padding as unchanged', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'renamed-map', mapId: MAP_ID, title: '   ' })).toEqual({
      kind: 'refused',
      refusal: { code: 'map-title-required' },
    });
    expect(session.getState().working).toBe(before);
    expect(authoring.complete({ kind: 'renamed-map', mapId: MAP_ID, title: ' Map 1 ' })).toEqual({
      kind: 'unchanged',
    });
  });

  /**
   * The Edit is addressed by Map id, as Rename Graph is by Graph id. Without
   * that the rename lands on whichever Map the resolver happens to answer,
   * so a draft begun on one Map and completed after the drawing Map
   * changed writes the title onto a Map the author never named.
   */
  it('refuses a rename addressed to a Map other than the one drawing', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'renamed-map',
        mapId: OTHER_MAP_ID,
        title: 'Workshop',
      }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'map-not-found' },
    });
    expect(session.getState().working).toBe(before);
  });
});

/**
 * The one Edit on the Space document above any Map.
 *
 * It is grouped with Add Map and Delete Map rather than with Rename
 * Map and Rename Graph, because those two write inside the drawing Map
 * and this writes the key beside `maps`. What that buys is asserted below:
 * the Edit needs no reported placement, and it moves nothing.
 */
describe('Rename Space', () => {
  it('trims and replaces only the Space title', () => {
    const { authoring, session } = openPositioned();

    expect(authoring.complete({ kind: 'renamed-space', title: '  Second draft  ' })).toEqual({
      kind: 'completed',
    });
    const after = session.getState().working;
    expect(after.document.title).toBe('Second draft');
    expect(after.resources).toEqual(positionedSnapshot.resources);
    expect(after.document.maps).toEqual(positionedSnapshot.document.maps);
    expect(after.document.defaultMap).toBe(MAP_ID);
  });

  /**
   * **The emphasised Graph is Navigation's answer, and a rename must not retake it.**
   *
   * Activating a Graph is not an Edit (ADR 0028), so the Graph a reader is
   * looking at routinely differs from the `activeGraph` the Map stores. An
   * Edit that re-resolves from the Map would therefore make a rename of the
   * Space activate a different Graph — moving the emphasis, the Dock's Graph
   * cluster and the product URL for a change that wrote only `document.title`.
   * `created-map` and `deleted-map` re-resolve because each lands the
   * reader in a different Map; this one lands nowhere.
   */
  it('leaves the Active Graph where Navigation put it', () => {
    const twoGraphs: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        maps: [
          {
            ...positionedSnapshot.document.maps![0]!,
            graphs: [MAIN_GRAPH, { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
            // Stored as the first, so re-resolving and preserving give different
            // answers and the assertion below can tell them apart.
            activeGraph: GRAPH_ID,
          },
        ],
      },
    };
    const { authoring, navigation } = open(twoGraphs);
    navigation.activateGraph(OTHER_GRAPH_ID);

    expect(authoring.complete({ kind: 'renamed-space', title: 'Renamed' })).toEqual({
      kind: 'completed',
    });

    expect(navigation.getState().activeGraphId).toBe(OTHER_GRAPH_ID);
    expect(navigation.getState().selectedMapId).toBe(MAP_ID);
  });

  it('refuses a blank Space title and treats the stored title with padding as unchanged', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'renamed-space', title: '' })).toEqual({
      kind: 'refused',
      refusal: { code: 'space-title-required' },
    });
    expect(authoring.complete({ kind: 'renamed-space', title: '  \t ' })).toEqual({
      kind: 'refused',
      refusal: { code: 'space-title-required' },
    });
    expect(authoring.complete({ kind: 'renamed-space', title: ' Space ' })).toEqual({
      kind: 'unchanged',
    });
    expect(session.getState().working).toBe(before);
  });

  /**
   * A Space's name is not written into a Map, so a rename has no geometry
   * to wait on — the same standing Add Map and Delete Map have.
   */
  it('does not require the current canvas placement to resolve', () => {
    const { authoring, session } = open();

    expect(authoring.complete({ kind: 'renamed-space', title: 'Before any layout' })).toEqual({
      kind: 'completed',
    });
    expect(session.getState().working.document.title).toBe('Before any layout');
  });

  /**
   * The Map rides through a rename unchanged — `renamed-space` writes only
   * `document.title` — so an Open Resource's remembered Open Size survives it too,
   * with nothing narrower than the whole Map in the way to drop it.
   */
  it('leaves an Open Resource and its remembered Open Size exactly as they were', () => {
    const opened: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        maps: [
          {
            ...positionedSnapshot.document.maps![0]!,
            positions: {
              [RESOURCE_A]: { x: 10, y: 20, open: false, openSize: { width: 500, height: 300 } },
              [RESOURCE_B]: { x: 300, y: 40, open: true, openSize: { width: 640, height: 360 } },
            },
          },
        ],
      },
    };
    const { authoring, session } = open(opened);

    expect(authoring.complete({ kind: 'renamed-space', title: 'Renamed' })).toEqual({
      kind: 'completed',
    });

    expect(mapOf(session.getState().working, MAP_ID)).toEqual(mapOf(opened, MAP_ID));
  });

  /**
   * The title rides inside the `document` JSON the ordinary commit path already
   * carries, so the round trip needs no migration — only the proof that it is
   * really there when the Space is read back.
   */
  it('survives a commit and a reload', async () => {
    const loaded = { snapshot: positionedSnapshot, revision: 3n, exportedRevision: null };
    const backend = MemorySpaceBackend.asMeta(loaded);
    const session = openSpaceSession(backend, loaded);
    const { authoring } = composeApp({
      spaceSession: session,
      selection: MAP_ID,
      newId: mintingIds(MINTED),
    });

    expect(authoring.complete({ kind: 'renamed-space', title: 'Stored name' })).toEqual({
      kind: 'completed',
    });
    await vi.waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

    const stored = await backend.loadSpace(SPACE_ID);
    expect(stored?.snapshot.document.title).toBe('Stored name');

    // Reload: a fresh session and composition over exactly what was stored.
    const reopened = composeApp({
      spaceSession: openSpaceSession(backend, stored!),
      selection: MAP_ID,
      newId: mintingIds(MINTED),
    });
    expect(reopened.currentSpace().title).toBe('Stored name');
  });
});

describe('Delete Map', () => {
  const otherGraph: Graph = { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] };
  const twoMaps: SpaceSnapshot = {
    ...positionedSnapshot,
    document: {
      ...positionedSnapshot.document,
      maps: [
        positionedSnapshot.document.maps![0]!,
        {
          id: OTHER_MAP_ID,
          title: 'Map 2',
          kind: 'positioned',
          positions: {
            [RESOURCE_B]: {
              x: 80,
              y: 90,
              open: true,
              openSize: { width: 640, height: 360 },
            },
          },
          graphs: [otherGraph],
          activeGraph: OTHER_GRAPH_ID,
        },
      ],
    },
  };

  it('deletes only the selected Map and continues in the first survivor', () => {
    const { authoring, navigation, session } = open(twoMaps, OTHER_MAP_ID);

    expect(authoring.complete({ kind: 'deleted-map', mapId: OTHER_MAP_ID })).toEqual({
      kind: 'completed',
    });

    expect(session.getState().working.resources).toEqual(twoMaps.resources);
    expect(session.getState().working.document.maps).toEqual([
      positionedSnapshot.document.maps![0]!,
    ]);
    expect(navigation.getState().selectedMapId).toBe(MAP_ID);
    expect(navigation.getState().activeGraphId).toBe(GRAPH_ID);
    expect(authoring.mapPlacement().get(RESOURCE_A)).toEqual({ x: 10, y: 20, open: false });
  });

  it('refuses to delete the last Map with a stable identity', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-map', mapId: MAP_ID })).toEqual({
      kind: 'refused',
      refusal: { code: 'space-must-keep-map' },
    });
    expect(session.getState().working).toBe(before);
  });
});

describe('Delete Graph', () => {
  const twoGraphs: SpaceSnapshot = {
    ...positionedSnapshot,
    document: {
      ...positionedSnapshot.document,
      maps: [
        {
          ...positionedSnapshot.document.maps![0]!,
          graphs: [MAIN_GRAPH, { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
          activeGraph: OTHER_GRAPH_ID,
        },
      ],
    },
  };

  it('removes exactly one Graph and activates the first survivor', () => {
    const { authoring, session, navigation } = open(twoGraphs);

    expect(authoring.complete({ kind: 'deleted-graph', graphId: OTHER_GRAPH_ID })).toEqual({
      kind: 'completed',
    });

    expect(graphsOf(session.getState().working)).toEqual([MAIN_GRAPH]);
    expect(navigation.getState().activeGraphId).toBe(GRAPH_ID);
    // Resources and positions are untouched; only the Graph left.
    expect(session.getState().working.resources).toEqual(positionedSnapshot.resources);
    expect(mapOf(session.getState().working, MAP_ID)?.positions).toEqual(
      positionedSnapshot.document.maps![0]!.positions,
    );
  });

  it('keeps the emphasis where it was when another Graph was deleted', () => {
    const { authoring, navigation } = open(twoGraphs);

    authoring.complete({ kind: 'deleted-graph', graphId: GRAPH_ID });

    expect(navigation.getState().activeGraphId).toBe(OTHER_GRAPH_ID);
  });

  it("refuses to delete a Map's last Graph", () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-graph', graphId: GRAPH_ID })).toEqual({
      kind: 'refused',
      refusal: { code: 'map-must-keep-graph' },
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a Graph another Map owns, although the Space plainly holds it', () => {
    const twoMaps: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        maps: [
          positionedSnapshot.document.maps![0]!,
          {
            id: OTHER_MAP_ID,
            title: 'Map 2',
            kind: 'positioned',
            positions: { [RESOURCE_A]: { x: 0, y: 400, open: false } },
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
          },
        ],
      },
    };
    const { authoring } = open(twoMaps);

    expect(authoring.complete({ kind: 'deleted-graph', graphId: OTHER_GRAPH_ID })).toEqual({
      kind: 'refused',
      refusal: { code: 'graph-not-owned' },
    });
  });
});

describe('Edge lifecycle', () => {
  it('replaces exactly one endpoint and keeps the Edge in its Graph', () => {
    const { authoring, session } = open({
      ...positionedSnapshot,
      resources: [
        ...positionedSnapshot.resources,
        { id: RESOURCE_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
      document: {
        ...positionedSnapshot.document,
        maps: [
          {
            ...positionedSnapshot.document.maps![0]!,
            positions: {
              [RESOURCE_A]: { x: 10, y: 20, open: false },
              [RESOURCE_B]: { x: 300, y: 40, open: false },
              [RESOURCE_C]: { x: 600, y: 40, open: false },
            },
          },
        ],
      },
    });

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: RESOURCE_A, to: RESOURCE_B },
        endpoint: 'to',
        resourceId: RESOURCE_C,
      }),
    ).toEqual({ kind: 'completed' });

    expect(graphsOf(session.getState().working)).toEqual([
      { id: GRAPH_ID, title: 'Main', edges: [{ from: RESOURCE_A, to: RESOURCE_C }] },
    ]);
  });

  it('accepts a reconnection that makes a self-Edge', () => {
    const { authoring, session } = openPositioned();

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: RESOURCE_A, to: RESOURCE_B },
        endpoint: 'from',
        resourceId: RESOURCE_B,
      }),
    ).toEqual({ kind: 'completed' });
    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([
      { from: RESOURCE_B, to: RESOURCE_B },
    ]);
  });

  it('treats returning an endpoint to where it came from as unchanged', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: RESOURCE_A, to: RESOURCE_B },
        endpoint: 'to',
        resourceId: RESOURCE_B,
      }),
    ).toEqual({ kind: 'unchanged' });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a reconnection that would duplicate an Edge already in the Graph', () => {
    const both: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        maps: [
          {
            ...positionedSnapshot.document.maps![0]!,
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Main',
                edges: [
                  { from: RESOURCE_A, to: RESOURCE_B },
                  { from: RESOURCE_B, to: RESOURCE_B },
                ],
              },
            ],
          },
        ],
      },
    };
    const { authoring } = open(both);

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: RESOURCE_A, to: RESOURCE_B },
        endpoint: 'from',
        resourceId: RESOURCE_B,
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'edge-already-exists' } });
  });

  it('refuses a reconnection onto a Resource this Map does not hold', () => {
    const sparse: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        ...positionedSnapshot.resources,
        { id: RESOURCE_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
    };
    const { authoring } = open(sparse);

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: RESOURCE_A, to: RESOURCE_B },
        endpoint: 'to',
        resourceId: RESOURCE_C,
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'edge-resource-outside-map' } });
  });

  it('refuses an Edge the Graph no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({
        kind: 'deleted-edge',
        graphId: GRAPH_ID,
        edge: { from: RESOURCE_B, to: RESOURCE_A },
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'edge-not-found' } });
  });

  it('deletes one Edge and leaves the Graph standing, empty', () => {
    const { authoring, session, navigation } = openPositioned();

    expect(
      authoring.complete({
        kind: 'deleted-edge',
        graphId: GRAPH_ID,
        edge: { from: RESOURCE_A, to: RESOURCE_B },
      }),
    ).toEqual({ kind: 'completed' });

    // Removing the last Edge retains the Graph: Graphs go only through Delete
    // Graph, and this Map has just the one anyway.
    expect(graphsOf(session.getState().working)).toEqual([
      { id: GRAPH_ID, title: 'Main', edges: [] },
    ]);
    expect(navigation.getState().activeGraphId).toBe(GRAPH_ID);
  });
});

/**
 * The one eligibility query behind every Edge gesture.
 *
 * What it buys is that a gesture the canvas offers cannot be one the Edit
 * silently drops: each case below asks eligibility *and* completes the same
 * proposal, and the two have to agree. The reasons are asserted verbatim —
 * only Authoring knows which rule was hit, and that sentence is what the
 * surface shows.
 */
describe('Edge eligibility', () => {
  const RECONNECT = {
    kind: 'reconnect',
    graphId: GRAPH_ID,
    edge: { from: RESOURCE_A, to: RESOURCE_B },
    endpoint: 'to',
  } as const;

  it('offers a connection the completion accepts', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.edgeEligibility({ kind: 'connect', from: RESOURCE_B, to: RESOURCE_A }),
    ).toEqual({
      kind: 'eligible',
    });
    expect(
      authoring.complete({ kind: 'connected-resources', from: RESOURCE_B, to: RESOURCE_A }),
    ).toEqual({
      kind: 'completed',
    });
  });

  it('refuses a duplicate with the reason the completion gives', () => {
    const { authoring } = openPositioned();

    const refusal = { kind: 'refused', refusal: { code: 'edge-already-exists' } };
    expect(
      authoring.edgeEligibility({ kind: 'connect', from: RESOURCE_A, to: RESOURCE_B }),
    ).toEqual(refusal);
    expect(
      authoring.complete({ kind: 'connected-resources', from: RESOURCE_A, to: RESOURCE_B }),
    ).toEqual(refusal);
  });

  it('offers a self-Edge and a cycle, which are legal authored structure', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.edgeEligibility({ kind: 'connect', from: RESOURCE_A, to: RESOURCE_A }),
    ).toEqual({
      kind: 'eligible',
    });
    expect(
      authoring.edgeEligibility({ kind: 'connect', from: RESOURCE_B, to: RESOURCE_A }),
    ).toEqual({
      kind: 'eligible',
    });
  });

  it('refuses a Resource the selected Map does not hold', () => {
    const sparse: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        ...positionedSnapshot.resources,
        { id: RESOURCE_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
    };
    const { authoring } = open(sparse);

    expect(
      authoring.edgeEligibility({ kind: 'connect', from: RESOURCE_A, to: RESOURCE_C }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'edge-resource-outside-map' },
    });
    expect(authoring.edgeEligibility({ kind: 'create-and-connect', from: RESOURCE_C })).toEqual({
      kind: 'refused',
      refusal: { code: 'edge-resource-outside-map' },
    });
  });

  /**
   * An empty drop's Resource does not exist yet, so it can duplicate nothing. The
   * two connecting proposals therefore diverge on exactly one rule, and this is
   * the case that would go unnoticed if they were folded into one query.
   */
  it('offers an empty drop from a Resource whose every existing Edge is taken', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.edgeEligibility({ kind: 'connect', from: RESOURCE_A, to: RESOURCE_B }).kind,
    ).toBe('refused');
    expect(authoring.edgeEligibility({ kind: 'create-and-connect', from: RESOURCE_A })).toEqual({
      kind: 'eligible',
    });
  });

  /**
   * **Returning an endpoint to the Resource it already names is eligible**, and
   * completes as `unchanged`. Eligibility answers what the author may still do,
   * not what the Edit will turn out to have changed — a picker that disabled the
   * current value would show it as the one forbidden choice.
   */
  it('offers a reconnection back to the endpoint it came from, which completes unchanged', () => {
    const { authoring } = openPositioned();

    expect(authoring.edgeEligibility({ ...RECONNECT, resourceId: RESOURCE_B })).toEqual({
      kind: 'eligible',
    });
    expect(
      authoring.complete({ ...RECONNECT, kind: 'reconnected-edge', resourceId: RESOURCE_B }),
    ).toEqual({
      kind: 'unchanged',
    });
  });

  it('refuses a reconnection onto a Resource outside this Map, and completes the same way', () => {
    const sparse: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        ...positionedSnapshot.resources,
        { id: RESOURCE_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
    };
    const { authoring } = open(sparse);

    const refusal = { kind: 'refused', refusal: { code: 'edge-resource-outside-map' } };
    expect(authoring.edgeEligibility({ ...RECONNECT, resourceId: RESOURCE_C })).toEqual(refusal);
    expect(
      authoring.complete({ ...RECONNECT, kind: 'reconnected-edge', resourceId: RESOURCE_C }),
    ).toEqual(refusal);
  });

  it('refuses a reconnection naming a Graph this Map does not own', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.edgeEligibility({ ...RECONNECT, graphId: UNKNOWN_GRAPH, resourceId: RESOURCE_A }),
    ).toEqual({ kind: 'refused', refusal: { code: 'graph-not-owned' } });
  });

  /**
   * The completion has to re-ask the rule, and this is the case where dropping
   * it would go unnoticed: an Edge the Graph no longer holds indexes at `-1`, so
   * the `map` that writes the reconnection replaces nothing and the Edit answers
   * as though it had — `unchanged` when the snapshot is otherwise untouched,
   * `completed` when writing the Map back settles something else, and the
   * refusal the author is owed never said either way.
   */
  it('refuses an Edge the Graph no longer holds, and completes the same way', () => {
    const { authoring } = openPositioned();
    const absent = {
      ...RECONNECT,
      edge: { from: RESOURCE_B, to: RESOURCE_A },
      resourceId: RESOURCE_A,
    } as const;

    const refusal = { kind: 'refused', refusal: { code: 'edge-not-found' } };
    expect(authoring.edgeEligibility(absent)).toEqual(refusal);
    expect(authoring.complete({ ...absent, kind: 'reconnected-edge' })).toEqual(refusal);
  });
});

describe('Map membership', () => {
  /** A Space holding a third Resource the Map does not place. */
  const sparse: SpaceSnapshot = {
    ...positionedSnapshot,
    resources: [
      ...positionedSnapshot.resources,
      { id: RESOURCE_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
    ],
  };

  it('adds an absent Space Resource at a deliberate position and infers no Edge', () => {
    const { authoring, session } = open(sparse);

    expect(
      authoring.complete({ kind: 'added-resource-to-map', resourceId: RESOURCE_C, anchor: CENTRE }),
    ).toEqual({ kind: 'completed' });

    expect(mapOf(session.getState().working, MAP_ID)?.positions).toEqual({
      [RESOURCE_A]: { x: 10, y: 20, open: false },
      [RESOURCE_B]: { x: 300, y: 40, open: false },
      [RESOURCE_C]: CENTRE,
    });
    expect(graphsOf(session.getState().working)).toEqual([MAIN_GRAPH]);
  });

  it('refuses a Resource the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({
        kind: 'added-resource-to-map',
        resourceId: UNKNOWN_RESOURCE,
        anchor: CENTRE,
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'resource-not-found' } });
  });

  it('refuses a Resource the Map already holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'added-resource-to-map', resourceId: RESOURCE_A, anchor: CENTRE }),
    ).toEqual({ kind: 'refused', refusal: { code: 'resource-already-in-map' } });
  });

  it('refuses removing a Resource the Map does not hold', () => {
    const { authoring } = open(sparse);

    expect(
      authoring.complete({ kind: 'removed-resource-from-map', resourceId: RESOURCE_C }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'resource-not-in-map' },
    });
  });
});

describe('Delete Resource from Space', () => {
  it('refuses a Resource its Reference Resources still point at, naming them', () => {
    const referenced: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        positionedSnapshot.resources[0]!,
        { id: RESOURCE_B, document: { title: 'A again', kind: 'reference', target: RESOURCE_A } },
      ],
    };
    const { authoring, session } = open(referenced);
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-resource', resourceId: RESOURCE_A })).toEqual({
      kind: 'refused',
      refusal: {
        code: 'resource-has-references',
        referenceTitles: ['A again'],
      },
    });
    expect(session.getState().working).toBe(before);
  });

  /*
   * A Space Resource owns the Space it names (ADR 0058), so deleting it deletes
   * that Space and the closure below it — one coordinated multi-Space Edit,
   * which is the session registry's and not a single-Space update this seam can
   * make. Completing it here stores a Space whose target is unreachable, and
   * aggregate intake refuses that commit permanently with the Resource already gone
   * from the working state, leaving the author nothing to correct.
   */
  it('refuses deleting a Space Resource rather than orphaning the Space it owns', () => {
    const linked: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        positionedSnapshot.resources[0]!,
        {
          id: RESOURCE_B,
          document: {
            title: 'Nested Space',
            kind: 'space',
            spaceId: UNKNOWN_RESOURCE,
            map: UNLOADED_MAP,
            graph: UNLOADED_GRAPH,
          },
        },
      ],
    };
    const { authoring, session } = open(linked);
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-resource', resourceId: RESOURCE_B })).toEqual({
      kind: 'refused',
      refusal: { code: 'space-resource-deletion-unsupported' },
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses deleting a Space Resource a Reference Resource targets as a Space Resource deletion', () => {
    // Decided before the Reference Resource rule: the cascade a Space Resource
    // owes is the session registry's whether or not anything targets it.
    const referencedSpace: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        {
          id: RESOURCE_A,
          document: {
            title: 'Nested Space',
            kind: 'space',
            spaceId: UNKNOWN_RESOURCE,
            map: UNLOADED_MAP,
            graph: UNLOADED_GRAPH,
          },
        },
        { id: RESOURCE_B, document: { title: 'A again', kind: 'reference', target: RESOURCE_A } },
      ],
    };
    const { authoring, session } = open(referencedSpace);
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-resource', resourceId: RESOURCE_A })).toEqual({
      kind: 'refused',
      refusal: { code: 'space-resource-deletion-unsupported' },
    });
    expect(session.getState().working).toBe(before);
  });

  it('deletes a Reference Resource and leaves its Target untouched', () => {
    const referenced: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        positionedSnapshot.resources[0]!,
        { id: RESOURCE_B, document: { title: 'A again', kind: 'reference', target: RESOURCE_A } },
      ],
    };
    const { authoring, session } = open(referenced);

    expect(authoring.complete({ kind: 'deleted-resource', resourceId: RESOURCE_B })).toEqual({
      kind: 'completed',
    });
    expect(session.getState().working.resources).toEqual([positionedSnapshot.resources[0]]);
  });

  it('removing a Resource from one Map is never blocked by an incoming Reference Resource', () => {
    const referenced: SpaceSnapshot = {
      ...positionedSnapshot,
      resources: [
        positionedSnapshot.resources[0]!,
        { id: RESOURCE_B, document: { title: 'A again', kind: 'reference', target: RESOURCE_A } },
      ],
    };
    const { authoring, session } = open(referenced);

    expect(
      authoring.complete({ kind: 'removed-resource-from-map', resourceId: RESOURCE_A }),
    ).toEqual({
      kind: 'completed',
    });
    expect(session.getState().working.resources).toEqual(referenced.resources);
  });

  it('refuses a Resource the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(authoring.complete({ kind: 'deleted-resource', resourceId: UNKNOWN_RESOURCE })).toEqual({
      kind: 'refused',
      refusal: { code: 'resource-not-found' },
    });
  });
});

describe('Keep local', () => {
  /**
   * The pair to Retry, and the same rule: it commits the *newest* complete
   * working Space rather than the snapshot that first hit the conflict. The
   * Edit made while the conflict stood is what proves it — assembling the
   * snapshot in the caller is exactly how that Edit gets dropped.
   */
  it('commits the newest working Space, including Edits made during the conflict', async () => {
    const remote: SpaceSnapshot = {
      ...positionedSnapshot,
      document: { ...positionedSnapshot.document, title: 'Stored' },
    };
    const backend = MemorySpaceBackend.asMeta({
      snapshot: remote,
      revision: 4n,
      exportedRevision: null,
    });
    const local = { snapshot: positionedSnapshot, revision: 3n, exportedRevision: null };
    const session = openSpaceSession(backend, local);
    const { authoring } = composeApp({ spaceSession: session, selection: MAP_ID });

    authoring.complete({ kind: 'renamed-graph', graphId: GRAPH_ID, title: 'Before conflict' });
    await vi.waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));

    // A later Edit, legal while the conflict stands.
    expect(authoring.complete({ kind: 'added-graph' })).toMatchObject({ kind: 'completed' });

    authoring.keepLocalWork();
    await vi.waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

    const stored = await backend.loadSpace(SPACE_ID);
    expect(graphsOf(stored!.snapshot).map((graph) => graph.title)).toEqual([
      'Before conflict',
      'Graph 1',
    ]);
  });

  it('does nothing outside a conflict', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState();

    authoring.keepLocalWork();

    expect(session.getState()).toBe(before);
  });
});

describe('Stale identities', () => {
  it('refuses an operation naming a Graph nothing owns', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'renamed-graph', graphId: UNKNOWN_GRAPH, title: 'Renamed' }),
    ).toEqual({ kind: 'refused', refusal: { code: 'graph-not-owned' } });
  });
});

describe('connecting Resources on an embedded Map', () => {
  const SHOWN_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
  const other = {
    id: OTHER_MAP_ID,
    title: 'Other Map',
    kind: 'positioned' as const,
    positions: {
      [RESOURCE_A]: { x: 500, y: 600, open: false as const },
      [RESOURCE_C]: { x: 800, y: 600, open: false as const },
    },
    graphs: [
      { id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] },
      { id: SHOWN_GRAPH_ID, title: 'Shown Graph', edges: [] },
    ],
    activeGraph: OTHER_GRAPH_ID,
  };
  const withOther = {
    ...positionedSnapshot,
    document: {
      ...positionedSnapshot.document,
      maps: [...(positionedSnapshot.document.maps ?? []), other],
    },
    resources: [
      ...positionedSnapshot.resources,
      { id: RESOURCE_C, document: { title: 'C', kind: 'markdown' as const, body: 'C' } },
    ],
  };
  it('writes the Edge into the Graph the Space Resource is showing, not the canvas Active Graph', () => {
    const { session, navigation, authoring } = open(withOther);
    const initialNavigation = navigation.getState();

    expect(
      authoring.completeInMap(OTHER_MAP_ID, {
        kind: 'connected-resources',
        from: RESOURCE_A,
        to: RESOURCE_C,
        graphId: SHOWN_GRAPH_ID,
      }).kind,
    ).toBe('completed');

    expect(navigation.getState()).toEqual(initialNavigation);
    expect(mapOf(session.getState().working, OTHER_MAP_ID)?.graphs).toEqual([
      { id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] },
      { id: SHOWN_GRAPH_ID, title: 'Shown Graph', edges: [{ from: RESOURCE_A, to: RESOURCE_C }] },
    ]);
    expect(mapOf(session.getState().working, MAP_ID)).toEqual(mapOf(positionedSnapshot, MAP_ID));
  });

  it('refuses a duplicate on the Graph being shown', () => {
    const { authoring } = open({
      ...withOther,
      document: {
        ...withOther.document,
        maps: [
          ...(positionedSnapshot.document.maps ?? []),
          {
            ...other,
            graphs: [
              { id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] },
              {
                id: SHOWN_GRAPH_ID,
                title: 'Shown Graph',
                edges: [{ from: RESOURCE_A, to: RESOURCE_C }],
              },
            ],
          },
        ],
      },
    });

    expect(
      authoring.completeInMap(OTHER_MAP_ID, {
        kind: 'connected-resources',
        from: RESOURCE_A,
        to: RESOURCE_C,
        graphId: SHOWN_GRAPH_ID,
      }),
    ).toMatchObject({ kind: 'refused', refusal: { code: 'edge-already-exists' } });
  });
});

describe('context commands on an embedded Map', () => {
  it('authors the addressed Map and Graph without switching the target canvas', () => {
    const other = {
      id: OTHER_MAP_ID,
      title: 'Other Map',
      kind: 'positioned' as const,
      positions: { [RESOURCE_A]: { x: 500, y: 600, open: false as const } },
      graphs: [{ id: OTHER_GRAPH_ID, title: 'Other Graph', edges: [] }],
      activeGraph: OTHER_GRAPH_ID,
    };
    const { session, navigation, authoring } = open({
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        maps: [...(positionedSnapshot.document.maps ?? []), other],
      },
    });
    const initialNavigation = navigation.getState();
    expect(
      authoring.completeInMap(OTHER_MAP_ID, {
        kind: 'renamed-map',
        mapId: OTHER_MAP_ID,
        title: 'Renamed context',
      }).kind,
    ).toBe('completed');
    expect(
      authoring.completeInMap(OTHER_MAP_ID, {
        kind: 'renamed-graph',
        graphId: OTHER_GRAPH_ID,
        title: 'Renamed Graph',
      }).kind,
    ).toBe('completed');
    expect(
      authoring.completeInMap(OTHER_MAP_ID, {
        kind: 'recolored-graph',
        graphId: OTHER_GRAPH_ID,
        color: '#f472b6',
      }).kind,
    ).toBe('completed');
    expect(authoring.completeInMap(OTHER_MAP_ID, { kind: 'added-graph' })).toMatchObject({
      kind: 'completed',
      createdGraphId: MINTED,
    });
    expect(
      authoring.completeInMap(OTHER_MAP_ID, { kind: 'deleted-graph', graphId: MINTED }).kind,
    ).toBe('completed');
    expect(
      authoring.completeInMap(OTHER_MAP_ID, {
        kind: 'renamed-graph',
        graphId: GRAPH_ID,
        title: 'Wrong owner',
      }),
    ).toMatchObject({ kind: 'refused', refusal: { code: 'graph-not-owned' } });
    const working = session.getState().working;
    expect(mapOf(working, OTHER_MAP_ID)).toMatchObject({
      title: 'Renamed context',
      positions: other.positions,
      graphs: [{ id: OTHER_GRAPH_ID, title: 'Renamed Graph', color: '#f472b6' }],
    });
    expect(mapOf(working, MAP_ID)).toEqual(mapOf(positionedSnapshot, MAP_ID));
    expect(working.document.defaultMap).toBe(MAP_ID);
    expect(navigation.getState()).toEqual(initialNavigation);
  });
});

it('repairs the target canvas when a context command deletes its active Graph', () => {
  const { session, navigation, authoring } = open({
    ...positionedSnapshot,
    document: {
      ...positionedSnapshot.document,
      maps: [
        {
          id: MAP_ID,
          title: 'Map 1',
          kind: 'positioned',
          positions: {
            [RESOURCE_A]: { x: 10, y: 20, open: false },
            [RESOURCE_B]: { x: 300, y: 40, open: false },
          },
          graphs: [MAIN_GRAPH, { id: OTHER_GRAPH_ID, title: 'Other', edges: [] }],
          activeGraph: GRAPH_ID,
        },
      ],
    },
  });
  expect(authoring.completeInMap(MAP_ID, { kind: 'deleted-graph', graphId: GRAPH_ID }).kind).toBe(
    'completed',
  );
  expect(navigation.getState().activeGraphId).toBe(OTHER_GRAPH_ID);
  expect(graphsOf(session.getState().working).map((graph) => graph.id)).toEqual([OTHER_GRAPH_ID]);
});
