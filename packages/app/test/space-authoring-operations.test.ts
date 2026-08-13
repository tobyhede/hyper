import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type Graph, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { GRAPH_PALETTE } from '../src/colors';
import { createNavigation } from '../src/navigation';
import { createSpaceAuthoring, type SpaceAuthoring } from '../src/space-authoring';
import { createRendererResolver, type RendererSelection } from '../src/renderer';
import { mintingIds } from './minting';

/**
 * The semantic operations Space Authoring gained for the complete Card and
 * Graph authoring experience, asserted through the interface that owns them.
 *
 * Every case here is a row of the handoff's domain transition matrix: what one
 * completed Edit writes, what crossing an Algorithmic View does to it, and the
 * invariant or no-op that row names. Deliberately separate from
 * `space-authoring.test.ts`, which owns the lifecycle around a completion —
 * ordering, the install gate, persistence and replacement — rather than the
 * transitions themselves.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const MINTED = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
/** The second identity an Edit mints, for the tests that create twice. */
const SECOND_MINTED = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
/**
 * The Graph identity a conversion mints. It comes from the resolver rather than
 * from Authoring's own minter: ADR 0045 puts identity at the conversion
 * boundary, which the resolver closes over — so a converting test names it here
 * and does *not* name a Graph id among the ids it hands `mintingIds`.
 */
const MINTED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
const UNKNOWN_CARD = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
const UNKNOWN_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000098');

const CENTRE = { x: 400, y: 300 };

const MAIN_GRAPH: Graph = { id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] };

/** A Space with no Layouts, and so with no Graphs at all (ADR 0040). */
const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'Space' },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

/** One Layout placing both Cards and owning the Graph over them. */
const positionedSnapshot: SpaceSnapshot = {
  ...automaticSnapshot,
  document: {
    ...automaticSnapshot.document,
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: { [CARD_A]: { x: 10, y: 20 }, [CARD_B]: { x: 300, y: 40 } },
        graphs: [MAIN_GRAPH],
      },
    ],
    defaultView: LAYOUT_ID,
  },
};

const graphsOf = (snapshot: SpaceSnapshot): readonly Graph[] =>
  (snapshot.document.layouts ?? []).flatMap((layout) => layout.graphs);

const layoutOf = (snapshot: SpaceSnapshot, layoutId: string) =>
  (snapshot.document.layouts ?? []).find((layout) => layout.id === layoutId);

/** A fresh sequence per composition: a Space converted twice needs two identities. */
function testResolver() {
  let minted = 0;
  return createRendererResolver({
    newGraphId: () => {
      minted += 1;
      return minted === 1
        ? MINTED_GRAPH
        : uuidSchema.parse(
            `00000000-0000-4000-8000-${(0xa00 + minted).toString(16).padStart(12, '0')}`,
          );
    },
  });
}

function open(
  snapshot: SpaceSnapshot = positionedSnapshot,
  renderer: RendererSelection = { kind: 'layout', layoutId: LAYOUT_ID },
  // The ids this Edit will mint, named by the test that asserts on them rather
  // than taken from the ambient generator (ADR 0016, and `./minting`).
  newId: () => UUID = mintingIds(MINTED),
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const currentSpace = () => {
    const result = loadSpaceSnapshot(session.getState().working);
    if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
    return result.space;
  };
  const resolveRenderer = testResolver();
  const navigation = createNavigation(currentSpace, resolveRenderer, renderer);
  const authoring = createSpaceAuthoring({
    session,
    navigation,
    currentSpace,
    resolveRenderer,
    newId,
  });
  return { session, navigation, authoring };
}

/** Install the geometry the renderer would have reported by now. */
const place = (authoring: SpaceAuthoring, entries: Record<string, [number, number]>): void => {
  authoring.replacePlacement(
    Placement.fromEntries(
      Object.entries(entries).map(([id, [x, y]]) => [uuidSchema.parse(id), { x, y }]),
    ),
  );
};

const openPositioned = (newId?: () => UUID) => {
  const opened = newId === undefined ? open() : open(positionedSnapshot, undefined, newId);
  place(opened.authoring, {
    [CARD_A]: [10, 20],
    [CARD_B]: [300, 40],
  });
  return opened;
};

const openAutomatic = (newId: () => UUID = mintingIds(MINTED)) => {
  const opened = open(automaticSnapshot, { kind: 'view', view: 'flow' }, newId);
  place(opened.authoring, {
    [CARD_A]: [10, 20],
    [CARD_B]: [300, 40],
  });
  return opened;
};

describe('Add Card', () => {
  it('creates one neutrally titled detached Card at the anchor it was given', () => {
    const { authoring, session } = openPositioned();

    expect(authoring.complete({ kind: 'created-card', anchor: CENTRE })).toEqual({
      kind: 'completed',
      createdCardId: MINTED,
    });

    expect(session.getState().working.cards[2]).toEqual({
      id: MINTED,
      document: { title: 'Card 1', kind: 'markdown', body: '' },
    });
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 40 },
      [MINTED]: CENTRE,
    });
    // No Edge, and no second Graph: Add Card adds neither (ADR 0040).
    expect(graphsOf(session.getState().working)).toEqual([MAIN_GRAPH]);
  });

  it('steps off an anchor another Card already occupies rather than stacking exactly', () => {
    // Two creations, so two ids. The old global mock answered both with one
    // constant and the duplicate went unnoticed; naming them is what makes the
    // second creation a real one.
    const { authoring, session } = openPositioned(mintingIds(MINTED, SECOND_MINTED));

    authoring.complete({ kind: 'created-card', anchor: CENTRE });
    authoring.complete({ kind: 'created-card', anchor: CENTRE });

    const positions = layoutOf(session.getState().working, LAYOUT_ID)?.positions ?? {};
    const stacked = Object.values(positions).filter(
      (at) => at !== undefined && at.x >= CENTRE.x && at.y >= CENTRE.y,
    );
    // A visible stack, not collision avoidance: the first Card never moves, and
    // the second takes one small diagonal step off it.
    expect(stacked).toEqual([CENTRE, { x: CENTRE.x + 24, y: CENTRE.y + 24 }]);
  });

  it('converts an Algorithmic View in the same Edit, leaving the Cards on screen where they are', () => {
    const { authoring, session, navigation } = openAutomatic(mintingIds(MINTED, LAYOUT_ID));

    expect(authoring.complete({ kind: 'created-card', anchor: CENTRE })).toEqual({
      kind: 'completed',
      createdCardId: MINTED,
    });

    expect(layoutOf(session.getState().working, LAYOUT_ID)).toEqual({
      id: LAYOUT_ID,
      title: 'Layout 1',
      kind: 'positioned',
      positions: {
        [CARD_A]: { x: 10, y: 20 },
        [CARD_B]: { x: 300, y: 40 },
        [MINTED]: CENTRE,
      },
      graphs: [{ id: MINTED_GRAPH, title: 'Graph 1', color: GRAPH_PALETTE[0], edges: [] }],
      activeGraph: MINTED_GRAPH,
    });
    expect(navigation.getState().selectedRenderer).toEqual({ kind: 'layout', layoutId: LAYOUT_ID });
    expect(navigation.getState().activeGraphId).toBe(MINTED_GRAPH);
  });
});

describe('Edit Card', () => {
  /**
   * A blank title is refused *at the interface*, not only at the field that
   * typed it. Intake rejects an empty title, and this derivation reports an
   * unloadable Space by throwing — so without this the author's own mistake
   * arrives as an exception, which the transient-authoring contract forbids.
   */
  it('refuses an empty Card title rather than throwing on intake', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'edited-card',
        cardId: CARD_A,
        document: { title: '', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({ kind: 'refused', reason: 'A Card title is required.' });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a title that is only whitespace, which the schema would accept', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    // `z.string().min(1)` counts characters and a space is one, so this would
    // be stored and draw as a Card with no name at all.
    expect(
      authoring.complete({
        kind: 'edited-card',
        cardId: CARD_A,
        document: { title: '   ', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({ kind: 'refused', reason: 'A Card title is required.' });
    expect(session.getState().working).toBe(before);
  });

  it('stores a trimmed title, and reads one that only gained padding as unchanged', () => {
    const { authoring, session } = openPositioned();

    expect(
      authoring.complete({
        kind: 'edited-card',
        cardId: CARD_A,
        document: { title: '  Renamed  ', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({ kind: 'completed' });
    expect(session.getState().working.cards[0]?.document.title).toBe('Renamed');

    expect(
      authoring.complete({
        kind: 'edited-card',
        cardId: CARD_A,
        document: { title: 'Renamed ', kind: 'markdown', body: 'A' },
      }),
    ).toEqual({ kind: 'unchanged' });
  });
});

describe('Add Alias', () => {
  it('creates and places an Alias on its Target, taking the Target title when none was typed', () => {
    const { authoring, session } = openPositioned();

    expect(authoring.complete({ kind: 'created-alias', target: CARD_A, anchor: CENTRE })).toEqual({
      kind: 'completed',
      createdCardId: MINTED,
    });

    expect(session.getState().working.cards[2]).toEqual({
      id: MINTED,
      document: { title: 'A', kind: 'alias', target: CARD_A },
    });
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions[MINTED]).toEqual(CENTRE);
  });

  it('keeps a title the author already entered', () => {
    const { authoring, session } = openPositioned();

    authoring.complete({
      kind: 'created-alias',
      target: CARD_A,
      title: '  Recap  ',
      anchor: CENTRE,
    });

    expect(session.getState().working.cards[2]?.document).toEqual({
      title: 'Recap',
      kind: 'alias',
      target: CARD_A,
    });
  });

  it('refuses a Target that is itself an Alias, so no chain is ever authored', () => {
    const aliased: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        positionedSnapshot.cards[0]!,
        { id: CARD_B, document: { title: 'A again', kind: 'alias', target: CARD_A } },
      ],
    };
    const { authoring, session } = open(aliased);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'created-alias', target: CARD_B, anchor: CENTRE })).toEqual({
      kind: 'refused',
      reason: 'An Alias must target a Card that owns its content.',
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a Target the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'created-alias', target: UNKNOWN_CARD, anchor: CENTRE }),
    ).toEqual({
      kind: 'refused',
      reason: 'That Target is no longer part of the Space.',
    });
  });
});

describe('Add Graph', () => {
  it('rotates colour by its appended position in the owning Layout', () => {
    const snapshot: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        layouts: [
          positionedSnapshot.document.layouts![0]!,
          {
            id: OTHER_LAYOUT_ID,
            title: 'Layout 2',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 20, y: 30 }, [CARD_B]: { x: 310, y: 50 } },
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Other', edges: [] }],
          },
        ],
      },
    };
    const { authoring, session } = open(snapshot);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.complete({ kind: 'added-graph' })).toEqual({
      kind: 'completed',
      createdGraphId: MINTED,
    });

    expect(layoutOf(session.getState().working, LAYOUT_ID)?.graphs.at(-1)?.color).toBe(
      GRAPH_PALETTE[1],
    );
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
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.activeGraph).toBe(MINTED);
    expect(navigation.getState().activeGraphId).toBe(MINTED);
    expect(session.getState().working.cards).toEqual(positionedSnapshot.cards);
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

  it('uses the requested Graph as a converted Layout initial Graph rather than adding a second', () => {
    const { authoring, session, navigation } = openAutomatic(mintingIds(LAYOUT_ID));

    expect(authoring.complete({ kind: 'added-graph' })).toEqual({
      kind: 'completed',
      createdGraphId: MINTED_GRAPH,
    });

    // One Graph, not two: the conversion's initial Graph *is* the one the author
    // asked for, rather than a predecessor it gets appended behind.
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.graphs).toEqual([
      { id: MINTED_GRAPH, title: 'Graph 1', color: GRAPH_PALETTE[0], edges: [] },
    ]);
    expect(navigation.getState().activeGraphId).toBe(MINTED_GRAPH);
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
      reason: 'A Graph title is required.',
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

  it('refuses managing a Graph from an Algorithmic View, which owns none', () => {
    const { authoring } = openAutomatic();

    expect(
      authoring.complete({ kind: 'renamed-graph', graphId: GRAPH_ID, title: 'Renamed' }),
    ).toEqual({ kind: 'refused', reason: 'Select a Layout to manage its Graphs.' });
  });
});

describe('Delete Graph', () => {
  const twoGraphs: SpaceSnapshot = {
    ...positionedSnapshot,
    document: {
      ...positionedSnapshot.document,
      layouts: [
        {
          ...positionedSnapshot.document.layouts![0]!,
          graphs: [MAIN_GRAPH, { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
          activeGraph: OTHER_GRAPH_ID,
        },
      ],
    },
  };

  it('removes exactly one Graph and activates the first survivor', () => {
    const { authoring, session, navigation } = open(twoGraphs);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.complete({ kind: 'deleted-graph', graphId: OTHER_GRAPH_ID })).toEqual({
      kind: 'completed',
    });

    expect(graphsOf(session.getState().working)).toEqual([MAIN_GRAPH]);
    expect(navigation.getState().activeGraphId).toBe(GRAPH_ID);
    // Cards and positions are untouched; only the Graph left.
    expect(session.getState().working.cards).toEqual(positionedSnapshot.cards);
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions).toEqual(
      positionedSnapshot.document.layouts![0]!.positions,
    );
  });

  it('keeps the emphasis where it was when another Graph was deleted', () => {
    const { authoring, navigation } = open(twoGraphs);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    authoring.complete({ kind: 'deleted-graph', graphId: GRAPH_ID });

    expect(navigation.getState().activeGraphId).toBe(OTHER_GRAPH_ID);
  });

  it("refuses to delete a Layout's last Graph", () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-graph', graphId: GRAPH_ID })).toEqual({
      kind: 'refused',
      reason: 'A Layout keeps at least one Graph.',
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a Graph another Layout owns, although the Space plainly holds it', () => {
    const twoLayouts: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        layouts: [
          positionedSnapshot.document.layouts![0]!,
          {
            id: OTHER_LAYOUT_ID,
            title: 'Layout 2',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 0, y: 400 } },
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
          },
        ],
      },
    };
    const { authoring } = open(twoLayouts);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.complete({ kind: 'deleted-graph', graphId: OTHER_GRAPH_ID })).toEqual({
      kind: 'refused',
      reason: 'That Graph is not one this Layout owns.',
    });
  });
});

describe('Edge lifecycle', () => {
  it('replaces exactly one endpoint and keeps the Edge in its Graph', () => {
    const { authoring, session } = open({
      ...positionedSnapshot,
      cards: [
        ...positionedSnapshot.cards,
        { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
      document: {
        ...positionedSnapshot.document,
        layouts: [
          {
            ...positionedSnapshot.document.layouts![0]!,
            positions: {
              [CARD_A]: { x: 10, y: 20 },
              [CARD_B]: { x: 300, y: 40 },
              [CARD_C]: { x: 600, y: 40 },
            },
          },
        ],
      },
    });
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40], [CARD_C]: [600, 40] });

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_A, to: CARD_B },
        endpoint: 'to',
        cardId: CARD_C,
      }),
    ).toEqual({ kind: 'completed' });

    expect(graphsOf(session.getState().working)).toEqual([
      { id: GRAPH_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_C }] },
    ]);
  });

  it('accepts a reconnection that makes a self-Edge', () => {
    const { authoring, session } = openPositioned();

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_A, to: CARD_B },
        endpoint: 'from',
        cardId: CARD_B,
      }),
    ).toEqual({ kind: 'completed' });
    expect(graphsOf(session.getState().working)[0]?.edges).toEqual([{ from: CARD_B, to: CARD_B }]);
  });

  it('treats returning an endpoint to where it came from as unchanged', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_A, to: CARD_B },
        endpoint: 'to',
        cardId: CARD_B,
      }),
    ).toEqual({ kind: 'unchanged' });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a reconnection that would duplicate an Edge already in the Graph', () => {
    const both: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        layouts: [
          {
            ...positionedSnapshot.document.layouts![0]!,
            graphs: [
              {
                id: GRAPH_ID,
                title: 'Main',
                edges: [
                  { from: CARD_A, to: CARD_B },
                  { from: CARD_B, to: CARD_B },
                ],
              },
            ],
          },
        ],
      },
    };
    const { authoring } = open(both);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_A, to: CARD_B },
        endpoint: 'from',
        cardId: CARD_B,
      }),
    ).toEqual({ kind: 'refused', reason: 'These Cards are already connected in this Graph.' });
  });

  it('refuses a reconnection onto a Card this Layout does not hold', () => {
    const sparse: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        ...positionedSnapshot.cards,
        { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
    };
    const { authoring } = open(sparse);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(
      authoring.complete({
        kind: 'reconnected-edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_A, to: CARD_B },
        endpoint: 'to',
        cardId: CARD_C,
      }),
    ).toEqual({ kind: 'refused', reason: 'An Edge can only join Cards in this Layout.' });
  });

  it('refuses an Edge the Graph no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({
        kind: 'deleted-edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_B, to: CARD_A },
      }),
    ).toEqual({ kind: 'refused', reason: 'That Edge is no longer in this Graph.' });
  });

  it('deletes one Edge and leaves the Graph standing, empty', () => {
    const { authoring, session, navigation } = openPositioned();

    expect(
      authoring.complete({
        kind: 'deleted-edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_A, to: CARD_B },
      }),
    ).toEqual({ kind: 'completed' });

    // Removing the last Edge retains the Graph: Graphs go only through Delete
    // Graph, and this Layout has just the one anyway.
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
    edge: { from: CARD_A, to: CARD_B },
    endpoint: 'to',
  } as const;

  /** What a pointer gesture reports: where React Flow has drawn the Layout's Cards. */
  const RENDERED = Placement.fromEntries([
    [CARD_A, { x: 10, y: 20 }],
    [CARD_B, { x: 300, y: 40 }],
  ]);

  it('offers a connection the completion accepts', () => {
    const { authoring } = openPositioned();

    expect(authoring.edgeEligibility({ kind: 'connect', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'eligible',
    });
    expect(
      authoring.complete({ kind: 'connected-cards', from: CARD_B, to: CARD_A, rendered: RENDERED }),
    ).toEqual({
      kind: 'completed',
    });
  });

  it('refuses a duplicate with the reason the completion gives', () => {
    const { authoring } = openPositioned();

    const refusal = { kind: 'refused', reason: 'These Cards are already connected in this Graph.' };
    expect(authoring.edgeEligibility({ kind: 'connect', from: CARD_A, to: CARD_B })).toEqual(
      refusal,
    );
    expect(
      authoring.complete({ kind: 'connected-cards', from: CARD_A, to: CARD_B, rendered: RENDERED }),
    ).toEqual(refusal);
  });

  it('offers a self-Edge and a cycle, which are legal authored structure', () => {
    const { authoring } = openPositioned();

    expect(authoring.edgeEligibility({ kind: 'connect', from: CARD_A, to: CARD_A })).toEqual({
      kind: 'eligible',
    });
    expect(authoring.edgeEligibility({ kind: 'connect', from: CARD_B, to: CARD_A })).toEqual({
      kind: 'eligible',
    });
  });

  it('refuses a Card the selected Layout does not hold', () => {
    const sparse: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        ...positionedSnapshot.cards,
        { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
    };
    const { authoring } = open(sparse);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.edgeEligibility({ kind: 'connect', from: CARD_A, to: CARD_C })).toEqual({
      kind: 'refused',
      reason: 'A connection can only join Cards in this Layout.',
    });
    expect(authoring.edgeEligibility({ kind: 'create-and-connect', from: CARD_C })).toEqual({
      kind: 'refused',
      reason: 'A connection can only join Cards in this Layout.',
    });
  });

  /**
   * An empty drop's Card does not exist yet, so it can duplicate nothing. The
   * two connecting proposals therefore diverge on exactly one rule, and this is
   * the case that would go unnoticed if they were folded into one query.
   */
  it('offers an empty drop from a Card whose every existing Edge is taken', () => {
    const { authoring } = openPositioned();

    expect(authoring.edgeEligibility({ kind: 'connect', from: CARD_A, to: CARD_B }).kind).toBe(
      'refused',
    );
    expect(authoring.edgeEligibility({ kind: 'create-and-connect', from: CARD_A })).toEqual({
      kind: 'eligible',
    });
  });

  /**
   * **Returning an endpoint to the Card it already names is eligible**, and
   * completes as `unchanged`. Eligibility answers what the author may still do,
   * not what the Edit will turn out to have changed — a picker that disabled the
   * current value would show it as the one forbidden choice.
   */
  it('offers a reconnection back to the endpoint it came from, which completes unchanged', () => {
    const { authoring } = openPositioned();

    expect(authoring.edgeEligibility({ ...RECONNECT, cardId: CARD_B })).toEqual({
      kind: 'eligible',
    });
    expect(authoring.complete({ ...RECONNECT, kind: 'reconnected-edge', cardId: CARD_B })).toEqual({
      kind: 'unchanged',
    });
  });

  it('refuses a reconnection onto a Card outside this Layout, and completes the same way', () => {
    const sparse: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        ...positionedSnapshot.cards,
        { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      ],
    };
    const { authoring } = open(sparse);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    const refusal = { kind: 'refused', reason: 'An Edge can only join Cards in this Layout.' };
    expect(authoring.edgeEligibility({ ...RECONNECT, cardId: CARD_C })).toEqual(refusal);
    expect(authoring.complete({ ...RECONNECT, kind: 'reconnected-edge', cardId: CARD_C })).toEqual(
      refusal,
    );
  });

  /**
   * The placement is not the Space. A Card can be drawn — and so be a position
   * key — while the Space no longer holds it, and an Edge naming one derives a
   * snapshot intake rejects, which this derivation answers by throwing. So the
   * reconnect rule asks the same second question a connection does, and refuses
   * rather than putting a defect in front of the author as their own mistake.
   */
  it('refuses a reconnection onto a Card the Space no longer holds', () => {
    const { authoring } = openPositioned();
    // Placed, so the Layout would take it — but never a Card of this Space.
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40], [UNKNOWN_CARD]: [600, 40] });

    const refusal = { kind: 'refused', reason: 'An Edge can only join Cards in this Layout.' };
    expect(authoring.edgeEligibility({ ...RECONNECT, cardId: UNKNOWN_CARD })).toEqual(refusal);
    expect(
      authoring.complete({ ...RECONNECT, kind: 'reconnected-edge', cardId: UNKNOWN_CARD }),
    ).toEqual(refusal);
  });

  it('refuses a reconnection naming a Graph this Layout does not own', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.edgeEligibility({ ...RECONNECT, graphId: UNKNOWN_GRAPH, cardId: CARD_A }),
    ).toEqual({ kind: 'refused', reason: 'That Graph is not one this Layout owns.' });
  });

  it('refuses an Edge the Graph no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.edgeEligibility({
        ...RECONNECT,
        edge: { from: CARD_B, to: CARD_A },
        cardId: CARD_A,
      }),
    ).toEqual({ kind: 'refused', reason: 'That Edge is no longer in this Graph.' });
  });

  /**
   * Reconnection has no answer at all without a Layout — an Algorithmic View
   * owns no Edge to move an endpoint of — while the two connecting gestures
   * cross one by converting it (ADR 0025).
   */
  it('refuses a reconnection from an Algorithmic View while still offering a connection', () => {
    const { authoring } = openAutomatic();

    expect(authoring.edgeEligibility({ ...RECONNECT, cardId: CARD_A })).toEqual({
      kind: 'refused',
      reason: 'Select a Layout to edit its Edges.',
    });
    expect(authoring.edgeEligibility({ kind: 'connect', from: CARD_A, to: CARD_B })).toEqual({
      kind: 'eligible',
    });
  });
});

describe('Layout membership', () => {
  /** A Space holding a third Card the Layout does not place. */
  const sparse: SpaceSnapshot = {
    ...positionedSnapshot,
    cards: [
      ...positionedSnapshot.cards,
      { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
    ],
  };

  it('adds an absent Space Card at a deliberate position and infers no Edge', () => {
    const { authoring, session } = open(sparse);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(
      authoring.complete({ kind: 'added-card-to-layout', cardId: CARD_C, anchor: CENTRE }),
    ).toEqual({ kind: 'completed' });

    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
      [CARD_B]: { x: 300, y: 40 },
      [CARD_C]: CENTRE,
    });
    expect(graphsOf(session.getState().working)).toEqual([MAIN_GRAPH]);
  });

  it('refuses a Card the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'added-card-to-layout', cardId: UNKNOWN_CARD, anchor: CENTRE }),
    ).toEqual({ kind: 'refused', reason: 'This Card is no longer part of the Space.' });
  });

  it('refuses a Card the Layout already holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'added-card-to-layout', cardId: CARD_A, anchor: CENTRE }),
    ).toEqual({ kind: 'refused', reason: 'This Card is already in this Layout.' });
  });

  it('refuses adding to an Algorithmic View, which has no membership to write', () => {
    const { authoring, session } = openAutomatic();
    const before = session.getState().working;

    expect(
      authoring.complete({ kind: 'added-card-to-layout', cardId: CARD_A, anchor: CENTRE }),
    ).toEqual({ kind: 'refused', reason: 'Select a Layout to add an existing Card to it.' });
    // Refused *before* converting: a Layout minted only to fail the next line
    // would leave the Space carrying a Layout the author never asked for.
    expect(session.getState().working).toBe(before);
  });

  it('removes membership and every incident Edge, in this Layout only', () => {
    const twoLayouts: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        layouts: [
          {
            ...positionedSnapshot.document.layouts![0]!,
            graphs: [
              MAIN_GRAPH,
              { id: OTHER_GRAPH_ID, title: 'Aside', edges: [{ from: CARD_B, to: CARD_A }] },
            ],
          },
          {
            id: OTHER_LAYOUT_ID,
            title: 'Layout 2',
            kind: 'positioned',
            positions: { [CARD_A]: { x: 0, y: 400 }, [CARD_B]: { x: 0, y: 600 } },
            graphs: [{ id: MINTED, title: 'Elsewhere', edges: [{ from: CARD_A, to: CARD_B }] }],
          },
        ],
      },
    };
    const { authoring, session } = open(twoLayouts);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.complete({ kind: 'removed-card-from-layout', cardId: CARD_B })).toEqual({
      kind: 'completed',
    });

    const working = session.getState().working;
    expect(layoutOf(working, LAYOUT_ID)?.positions).toEqual({ [CARD_A]: { x: 10, y: 20 } });
    expect(layoutOf(working, LAYOUT_ID)?.graphs).toEqual([
      { id: GRAPH_ID, title: 'Main', edges: [] },
      { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] },
    ]);
    // The Card stays in the Space and in every other Layout, Edges and all.
    expect(working.cards).toEqual(positionedSnapshot.cards);
    expect(layoutOf(working, OTHER_LAYOUT_ID)).toEqual(twoLayouts.document.layouts![1]);
  });

  it('refuses removing a Card the Layout does not hold', () => {
    const { authoring } = open(sparse);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.complete({ kind: 'removed-card-from-layout', cardId: CARD_C })).toEqual({
      kind: 'refused',
      reason: 'This Card is not in this Layout.',
    });
  });
});

describe('Delete Card from Space', () => {
  const twoLayouts: SpaceSnapshot = {
    ...positionedSnapshot,
    document: {
      ...positionedSnapshot.document,
      layouts: [
        positionedSnapshot.document.layouts![0]!,
        {
          id: OTHER_LAYOUT_ID,
          title: 'Layout 2',
          kind: 'positioned',
          positions: { [CARD_A]: { x: 0, y: 400 }, [CARD_B]: { x: 0, y: 600 } },
          graphs: [
            {
              id: OTHER_GRAPH_ID,
              title: 'Elsewhere',
              edges: [
                { from: CARD_A, to: CARD_B },
                { from: CARD_B, to: CARD_A },
              ],
            },
          ],
        },
      ],
    },
  };

  it('deletes the Card and cascades it out of every Layout at once', () => {
    const { authoring, session } = open(twoLayouts);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.complete({ kind: 'deleted-card', cardId: CARD_B })).toEqual({
      kind: 'completed',
    });

    const working = session.getState().working;
    expect(working.cards).toEqual([positionedSnapshot.cards[0]]);
    expect(layoutOf(working, LAYOUT_ID)?.positions).toEqual({ [CARD_A]: { x: 10, y: 20 } });
    expect(layoutOf(working, LAYOUT_ID)?.graphs).toEqual([{ ...MAIN_GRAPH, edges: [] }]);
    expect(layoutOf(working, OTHER_LAYOUT_ID)?.positions).toEqual({ [CARD_A]: { x: 0, y: 400 } });
    // Empty Graphs and Layouts remain: deleting a Card is not an instruction to
    // delete either.
    expect(layoutOf(working, OTHER_LAYOUT_ID)?.graphs).toEqual([
      { id: OTHER_GRAPH_ID, title: 'Elsewhere', edges: [] },
    ]);
    expect(loadSpaceSnapshot(working).ok).toBe(true);
  });

  it('refuses a Card its Aliases still point at, naming them', () => {
    const aliased: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        positionedSnapshot.cards[0]!,
        { id: CARD_B, document: { title: 'A again', kind: 'alias', target: CARD_A } },
      ],
    };
    const { authoring, session } = open(aliased);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-card', cardId: CARD_A })).toEqual({
      kind: 'refused',
      reason: 'Retarget or delete the Aliases of this Card first: A again.',
    });
    expect(session.getState().working).toBe(before);
  });

  it('deletes an Alias and leaves its Target untouched', () => {
    const aliased: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        positionedSnapshot.cards[0]!,
        { id: CARD_B, document: { title: 'A again', kind: 'alias', target: CARD_A } },
      ],
    };
    const { authoring, session } = open(aliased);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.complete({ kind: 'deleted-card', cardId: CARD_B })).toEqual({
      kind: 'completed',
    });
    expect(session.getState().working.cards).toEqual([positionedSnapshot.cards[0]]);
  });

  it('removing a Card from one Layout is never blocked by an incoming Alias', () => {
    const aliased: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        positionedSnapshot.cards[0]!,
        { id: CARD_B, document: { title: 'A again', kind: 'alias', target: CARD_A } },
      ],
    };
    const { authoring, session } = open(aliased);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

    expect(authoring.complete({ kind: 'removed-card-from-layout', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(session.getState().working.cards).toEqual(aliased.cards);
  });

  it('converts an Algorithmic View and then applies the deletion to what it produced', () => {
    const { authoring, session } = openAutomatic(mintingIds(LAYOUT_ID));

    expect(authoring.complete({ kind: 'deleted-card', cardId: CARD_B })).toEqual({
      kind: 'completed',
    });

    expect(session.getState().working.cards).toEqual([automaticSnapshot.cards[0]]);
    // The converted Layout never holds the deleted Card, so nothing has to
    // remove it afterwards.
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20 },
    });
  });

  it('refuses a Card the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(authoring.complete({ kind: 'deleted-card', cardId: UNKNOWN_CARD })).toEqual({
      kind: 'refused',
      reason: 'This Card is no longer part of the Space.',
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
    const backend = new MemorySpaceBackend([
      { snapshot: remote, revision: 4n, exportedRevision: null },
    ]);
    const local = { snapshot: positionedSnapshot, revision: 3n, exportedRevision: null };
    const session = openSpaceSession(backend, local);
    const currentSpace = () => {
      const result = loadSpaceSnapshot(session.getState().working);
      if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
      return result.space;
    };
    const resolveRenderer = testResolver();
    const navigation = createNavigation(currentSpace, resolveRenderer, {
      kind: 'layout',
      layoutId: LAYOUT_ID,
    });
    const authoring = createSpaceAuthoring({ session, navigation, currentSpace, resolveRenderer });
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

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
    ).toEqual({ kind: 'refused', reason: 'That Graph is not one this Layout owns.' });
  });

  it('refuses every operation before the view has arranged anything', () => {
    const { authoring } = open(automaticSnapshot, { kind: 'view', view: 'flow' });

    expect(authoring.complete({ kind: 'created-card', anchor: CENTRE })).toEqual({
      kind: 'refused',
      reason: 'This view has not finished arranging, so there is nowhere to write yet.',
    });
  });
});
