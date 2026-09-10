import { describe, expect, it, vi } from 'vitest';

import {
  COLLAPSED_CARD_SIZE,
  DEFAULT_OPEN_SIZE,
  uuidSchema,
  type CardPlacement,
  type Graph,
  type LayoutId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import { GRAPH_PALETTE } from '../src/colors';
import { composeApp } from '../src/compose-app';
import type { SpaceAuthoring } from '../src/space-authoring';

import { mintingIds } from './minting';

/**
 * The semantic operations Space Authoring gained for the complete Card and
 * Graph authoring experience, asserted through the interface that owns them.
 *
 * Every case here is a row of the handoff's domain transition matrix: what one
 * completed Edit writes, what creating a Layout does to it, and the
 * invariant or no-op that row names. Deliberately separate from
 * `space-authoring.test.ts`, which owns the lifecycle around a completion —
 * ordering, the install gate, persistence and replacement — rather than the
 * transitions themselves.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const CARD_D = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const CARD_E = uuidSchema.parse('00000000-0000-4000-8000-000000000009');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const MINTED = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
/** The second identity an Edit mints, for the tests that create twice. */
const SECOND_MINTED = uuidSchema.parse('00000000-0000-4000-8000-000000000032');
/** A Graph identity minted by Layout creation. */
const MINTED_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
/** What a second Layout creation would mint. */
const UNKNOWN_CARD = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
const UNKNOWN_GRAPH = uuidSchema.parse('00000000-0000-4000-8000-000000000098');

const CENTRE = { x: 400, y: 300, open: false };

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
        positions: {
          [CARD_A]: { x: 10, y: 20, open: false },
          [CARD_B]: { x: 300, y: 40, open: false },
        },
        graphs: [MAIN_GRAPH],
      },
    ],
    defaultLayout: LAYOUT_ID,
  },
};

const graphsOf = (snapshot: SpaceSnapshot): readonly Graph[] =>
  (snapshot.document.layouts ?? []).flatMap((layout) => layout.graphs);

const layoutOf = (snapshot: SpaceSnapshot, layoutId: string) =>
  (snapshot.document.layouts ?? []).find((layout) => layout.id === layoutId);

function open(
  snapshot: SpaceSnapshot = positionedSnapshot,
  layoutId: LayoutId = LAYOUT_ID,
  // The ids this Edit will mint, named by the test that asserts on them rather
  // than taken from the ambient generator (ADR 0016, and `./minting`).
  newId: () => UUID = mintingIds(MINTED),
) {
  const loaded = { snapshot, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([loaded]), loaded);
  const { navigation, authoring } = composeApp({
    spaceSession: session,
    selection: layoutId,
    newId,
    // These cases install whatever geometry they are about through `place`.
    initialPlacement: null,
  });
  return { session, navigation, authoring };
}

/** Install the geometry the canvas would have reported by now. */
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

describe('Add Layout', () => {
  it('creates and selects an empty Layout with one empty Active Graph', () => {
    const { authoring, navigation, session } = open(
      positionedSnapshot,
      LAYOUT_ID,
      mintingIds(MINTED, MINTED_GRAPH),
    );
    expect(authoring.complete({ kind: 'created-layout' })).toEqual({ kind: 'completed' });

    expect(session.getState().working.document.layouts).toEqual([
      positionedSnapshot.document.layouts![0],
      {
        id: MINTED,
        title: 'Layout 2',
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
    expect(session.getState().working.document.defaultLayout).toBe(MINTED);
    expect(navigation.getState().selectedLayoutId).toBe(MINTED);
  });

  it('does not require the current canvas placement to resolve', () => {
    const { authoring, navigation, session } = open(
      positionedSnapshot,
      LAYOUT_ID,
      mintingIds(MINTED, MINTED_GRAPH),
    );

    expect(authoring.complete({ kind: 'created-layout' })).toEqual({ kind: 'completed' });
    expect(session.getState().working.document.layouts).toHaveLength(2);
    expect(navigation.getState().selectedLayoutId).toBe(MINTED);
  });
});

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
      [CARD_A]: { x: 10, y: 20, open: false },
      [CARD_B]: { x: 300, y: 40, open: false },
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
    expect(stacked).toEqual([CENTRE, { x: CENTRE.x + 24, y: CENTRE.y + 24, open: false }]);
  });

  it('stores the canvas anchor as authored, whatever else is Open', () => {
    const expandedSnapshot: SpaceSnapshot = {
      ...positionedSnapshot,
      document: {
        ...positionedSnapshot.document,
        layouts: [
          {
            ...positionedSnapshot.document.layouts![0]!,
            positions: {
              [CARD_A]: { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } },
              [CARD_B]: { x: 300, y: 40, open: false },
            },
          },
        ],
      },
    };
    const { authoring, session } = open(expandedSnapshot);
    authoring.replacePlacement(
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } }],
        [CARD_B, { x: 300, y: 40, open: false }],
      ]),
    );

    authoring.complete({ kind: 'created-card', anchor: { x: 500, y: 400 } });

    // A canvas coordinate is an authored one: A being Open moved its neighbours
    // when the Edit that opened it ran, and nothing converts a drop point on the
    // way in any more (ADR 0084). The Card lands where it was dropped.
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions[MINTED]).toEqual({
      x: 500,
      y: 400,
      open: false,
    });
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
    ).toEqual({ kind: 'refused', refusal: { code: 'card-title-required' } });
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
    ).toEqual({ kind: 'refused', refusal: { code: 'card-title-required' } });
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

describe('Expanded Card geometry', () => {
  /**
   * What {@link DEFAULT_OPEN_SIZE} displaces by: the Open rect less the
   * collapsed one, per axis (ADR 0084). Named rather than derived so the
   * coordinates below read as positions instead of as arithmetic.
   */
  const GROWTH = { width: 300, height: 274 };

  /**
   * Five Cards at every relation to CARD_A the per-axis comparison
   * distinguishes: beyond on `x` and level on `y`, level on `x` and beyond on
   * `y`, beyond on both, and before on both.
   */
  const displacementSnapshot: SpaceSnapshot = {
    ...positionedSnapshot,
    cards: [
      ...positionedSnapshot.cards,
      { id: CARD_C, document: { title: 'C', kind: 'markdown', body: 'C' } },
      { id: CARD_D, document: { title: 'D', kind: 'markdown', body: 'D' } },
      { id: CARD_E, document: { title: 'E', kind: 'markdown', body: 'E' } },
    ],
    document: {
      ...positionedSnapshot.document,
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout 1',
          kind: 'positioned',
          positions: {
            [CARD_A]: { x: 100, y: 100, open: false },
            [CARD_B]: { x: 300, y: 100, open: false },
            [CARD_C]: { x: 100, y: 300, open: false },
            [CARD_D]: { x: 500, y: 500, open: false },
            [CARD_E]: { x: 40, y: 40, open: false },
          },
          graphs: [MAIN_GRAPH],
        },
      ],
      defaultLayout: LAYOUT_ID,
    },
  };

  const openDisplacement = () => {
    const opened = open(displacementSnapshot);
    // The geometry the canvas has reported by now: the Layout as authored.
    place(opened.authoring, {
      [CARD_A]: [100, 100],
      [CARD_B]: [300, 100],
      [CARD_C]: [100, 300],
      [CARD_D]: [500, 500],
      [CARD_E]: [40, 40],
    });
    return opened;
  };

  /** Every origin the Layout authors, so a whole Layout can be compared at once. */
  const originsOf = (session: ReturnType<typeof open>['session']) => {
    const origins = new Map<string, readonly [number, number]>();
    const positions = layoutOf(session.getState().working, LAYOUT_ID)?.positions ?? {};
    for (const [cardId, at] of Object.entries(positions)) {
      if (at !== undefined) origins.set(cardId, [at.x, at.y]);
    }
    return Object.fromEntries(origins);
  };

  /**
   * Report canvas geometry that keeps an Open Card Open, which {@link place}
   * cannot: it reports plain points, and every one of those is Closed.
   */
  const reportPlacement = (
    authoring: SpaceAuthoring,
    entries: Record<string, CardPlacement>,
  ): void => {
    authoring.replacePlacement(
      Placement.fromEntries(Object.entries(entries).map(([id, at]) => [uuidSchema.parse(id), at])),
    );
  };

  it('restores a resized Open Size after Closing and Opening again', () => {
    const { authoring, session } = openPositioned();

    expect(authoring.complete({ kind: 'opened-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(
      authoring.complete({
        kind: 'resized-card',
        cardId: CARD_A,
        size: { width: 640, height: 480 },
      }),
    ).toEqual({ kind: 'completed' });
    expect(authoring.complete({ kind: 'closed-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions[CARD_A]).toEqual({
      x: 10,
      y: 20,
      open: false,
      openSize: { width: 640, height: 480 },
    });

    expect(authoring.complete({ kind: 'opened-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions[CARD_A]).toEqual({
      x: 10,
      y: 20,
      open: true,
      openSize: { width: 640, height: 480 },
    });
  });

  it('Closes at the exact Closed rect without replacing the remembered Open Size', () => {
    const { authoring, session } = openPositioned();

    expect(authoring.complete({ kind: 'opened-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(
      authoring.complete({
        kind: 'resized-card',
        cardId: CARD_A,
        size: { width: 640, height: 480 },
      }),
    ).toEqual({ kind: 'completed' });

    expect(
      authoring.complete({
        kind: 'resized-card',
        cardId: CARD_A,
        size: { width: 260, height: 146 },
      }),
    ).toEqual({ kind: 'completed' });
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions[CARD_A]).toEqual({
      x: 10,
      y: 20,
      open: false,
      openSize: { width: 640, height: 480 },
    });
  });

  it('refuses a stale resize completion for a Card that is no longer Expanded', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({
        kind: 'resized-card',
        cardId: CARD_A,
        size: { width: 560, height: 420 },
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'card-not-expanded' } });
    expect(session.getState().working).toBe(before);
  });

  it('moves the Cards strictly beyond the opening Card by that axis growth, and nobody else', () => {
    const { authoring, session } = openDisplacement();

    expect(authoring.complete({ kind: 'opened-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(originsOf(session)).toEqual({
      // A Card does not displace itself.
      [CARD_A]: [100, 100],
      // Beyond on `x` and level on `y`, so it moves right and not down.
      [CARD_B]: [300 + GROWTH.width, 100],
      // The mirror of it: level on `x` and beyond on `y`.
      [CARD_C]: [100, 300 + GROWTH.height],
      [CARD_D]: [500 + GROWTH.width, 500 + GROWTH.height],
      // Before the Card on both axes: the room is made after it, not around it.
      [CARD_E]: [40, 40],
    });
  });

  it('returns every position to exactly what it was when the Card Closes again', () => {
    const { authoring, session } = openDisplacement();
    const before = originsOf(session);

    expect(authoring.complete({ kind: 'opened-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });
    expect(authoring.complete({ kind: 'closed-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(originsOf(session)).toEqual(before);
  });

  it('reclaims from a Card the author moved beyond the Open Card, which the Open never pushed', () => {
    // ADR 0084: Open and Close each read the Layout as it is at that moment and
    // remember nothing about who was pushed, so Close reclaims from everything
    // currently beyond the closing Card. This is the deliberate memoryless
    // behaviour and not a defect — recording which Cards a particular Open moved
    // is the per-Card history that ADR rejected, because it goes stale the
    // moment the author moves anything and makes two identical Layouts behave
    // differently.
    const { authoring, session } = openDisplacement();

    expect(authoring.complete({ kind: 'opened-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });
    // The author drags E from before the Open Card to beyond it on both axes.
    reportPlacement(authoring, {
      [CARD_A]: { x: 100, y: 100, open: true, openSize: DEFAULT_OPEN_SIZE },
      [CARD_B]: { x: 600, y: 100, open: false },
      [CARD_C]: { x: 100, y: 574, open: false },
      [CARD_D]: { x: 800, y: 774, open: false },
      [CARD_E]: { x: 900, y: 900, open: false },
    });

    expect(authoring.complete({ kind: 'closed-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });

    expect(originsOf(session)).toEqual({
      [CARD_A]: [100, 100],
      [CARD_B]: [300, 100],
      [CARD_C]: [100, 300],
      [CARD_D]: [500, 500],
      // Never pushed by the Open, and moved back by the Close all the same.
      [CARD_E]: [900 - GROWTH.width, 900 - GROWTH.height],
    });
  });

  it('takes an already Open Card room as it finds it, with nothing summed over Open Cards', () => {
    const { authoring, session } = openDisplacement();

    authoring.complete({ kind: 'opened-card', cardId: CARD_A });
    // B is at (600, 100) by now, and its own growth is measured from there.
    expect(authoring.complete({ kind: 'opened-card', cardId: CARD_B })).toEqual({
      kind: 'completed',
    });

    expect(originsOf(session)).toEqual({
      // Level with B on `y` and before it on `x`: A does not move for it.
      [CARD_A]: [100, 100],
      [CARD_B]: [600, 100],
      [CARD_C]: [100, 574 + GROWTH.height],
      [CARD_D]: [800 + GROWTH.width, 774 + GROWTH.height],
      [CARD_E]: [40, 40],
    });
  });

  it('refuses a subject the Layout does not hold and moves nobody', () => {
    const { authoring, session } = openDisplacement();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'opened-card', cardId: UNKNOWN_CARD })).toEqual({
      kind: 'refused',
      refusal: { code: 'card-not-in-layout' },
    });
    expect(authoring.complete({ kind: 'closed-card', cardId: UNKNOWN_CARD })).toEqual({
      kind: 'refused',
      refusal: { code: 'card-not-in-layout' },
    });
    expect(session.getState().working).toBe(before);
  });

  it('moves neighbours by the difference between the old growth and the new one', () => {
    const { authoring, session } = openDisplacement();
    authoring.complete({ kind: 'opened-card', cardId: CARD_A });

    expect(
      authoring.complete({
        kind: 'resized-card',
        cardId: CARD_A,
        size: { width: 860, height: 720 },
      }),
    ).toEqual({ kind: 'completed' });

    // 860x720 grows by (600, 574); the Open already applied (300, 274); the
    // difference this Edit applies is (300, 300).
    expect(originsOf(session)).toEqual({
      [CARD_A]: [100, 100],
      [CARD_B]: [900, 100],
      [CARD_C]: [100, 874],
      [CARD_D]: [1100, 1074],
      [CARD_E]: [40, 40],
    });
  });

  it('moves neighbours on one axis only when only one axis of the size changed', () => {
    const { authoring, session } = openDisplacement();
    authoring.complete({ kind: 'opened-card', cardId: CARD_A });

    // 100 wider at the same height, so the height difference is zero.
    authoring.complete({
      kind: 'resized-card',
      cardId: CARD_A,
      size: { width: 660, height: 420 },
    });

    expect(originsOf(session)).toEqual({
      [CARD_A]: [100, 100],
      [CARD_B]: [700, 100],
      [CARD_C]: [100, 574],
      [CARD_D]: [900, 774],
      [CARD_E]: [40, 40],
    });
  });

  it('is unchanged and moves nobody when the proposal is the size the Card already has', () => {
    const { authoring, session } = openDisplacement();
    authoring.complete({ kind: 'opened-card', cardId: CARD_A });
    const before = session.getState().working;

    expect(
      authoring.complete({ kind: 'resized-card', cardId: CARD_A, size: DEFAULT_OPEN_SIZE }),
    ).toEqual({ kind: 'unchanged' });
    expect(session.getState().working).toBe(before);
  });

  it('returns every position to where it started through Open, resize, resize back and Close', () => {
    const { authoring, session } = openDisplacement();
    const before = originsOf(session);

    authoring.complete({ kind: 'opened-card', cardId: CARD_A });
    authoring.complete({
      kind: 'resized-card',
      cardId: CARD_A,
      size: { width: 860, height: 720 },
    });
    authoring.complete({ kind: 'resized-card', cardId: CARD_A, size: DEFAULT_OPEN_SIZE });
    authoring.complete({ kind: 'closed-card', cardId: CARD_A });

    expect(originsOf(session)).toEqual(before);
  });

  it('reclaims the whole growth of the size it was Open at when a resize snaps to Closed', () => {
    const { authoring, session } = openDisplacement();
    const before = originsOf(session);

    authoring.complete({ kind: 'opened-card', cardId: CARD_A });
    authoring.complete({
      kind: 'resized-card',
      cardId: CARD_A,
      size: { width: 860, height: 720 },
    });

    // The magnetic Close (ADR 0066) arrives as a resize proposal at exactly the
    // collapsed size. What it gives back is (600, 574) — the growth of the
    // 860x720 the Card was actually Open at — and not the zero growth of the
    // collapsed rect being proposed.
    expect(
      authoring.complete({ kind: 'resized-card', cardId: CARD_A, size: COLLAPSED_CARD_SIZE }),
    ).toEqual({ kind: 'completed' });

    expect(originsOf(session)).toEqual(before);
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions[CARD_A]).toEqual({
      x: 100,
      y: 100,
      open: false,
      openSize: { width: 860, height: 720 },
    });
  });

  /**
   * A Card that leaves the Layout takes its room with it.
   *
   * Under the derived model this reclaimed itself: the entry carried the Open
   * state, so removing the entry removed the displacement. Now the room is
   * written into the neighbours' own coordinates, and a removal that only drops
   * the entry leaves a hole with nothing left on the canvas to explain it and no
   * Edit that can give it back. Leaving the Layout is a Close the Card does not
   * come back from, so it reclaims exactly as Close does (ADR 0084).
   */
  it('reclaims the room an Open Card held when it is removed from the Layout', () => {
    const { authoring, session } = openDisplacement();
    const before = originsOf(session);

    authoring.complete({ kind: 'opened-card', cardId: CARD_A });
    expect(authoring.complete({ kind: 'removed-card-from-layout', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });

    const { [CARD_A]: removed, ...remaining } = before;
    expect(removed).toBeDefined();
    expect(originsOf(session)).toEqual(remaining);
  });

  it('reclaims the room an Open Card held when it is deleted', () => {
    const { authoring, session } = openDisplacement();
    const before = originsOf(session);

    authoring.complete({ kind: 'opened-card', cardId: CARD_A });
    expect(authoring.complete({ kind: 'deleted-card', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });

    const { [CARD_A]: deleted, ...remaining } = before;
    expect(deleted).toBeDefined();
    expect(originsOf(session)).toEqual(remaining);
  });

  it('moves nobody when the Card leaving the Layout was Closed', () => {
    const { authoring, session } = openDisplacement();
    const before = originsOf(session);

    expect(authoring.complete({ kind: 'removed-card-from-layout', cardId: CARD_A })).toEqual({
      kind: 'completed',
    });

    const { [CARD_A]: removed, ...remaining } = before;
    expect(removed).toBeDefined();
    expect(originsOf(session)).toEqual(remaining);
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
      refusal: { code: 'alias-target-must-own-content', targetId: CARD_B },
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a Space Card Target, because an Alias can only show Markdown content', () => {
    const withSpaceCard: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        positionedSnapshot.cards[0]!,
        {
          id: CARD_B,
          document: { title: 'Nested Space', kind: 'space', spaceId: UNKNOWN_CARD },
        },
      ],
    };
    const { authoring, session } = open(withSpaceCard);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'created-alias', target: CARD_B, anchor: CENTRE })).toEqual({
      kind: 'refused',
      refusal: { code: 'alias-target-must-own-content', targetId: CARD_B },
    });
    expect(session.getState().working).toBe(before);
  });

  it('refuses a Target the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'created-alias', target: UNKNOWN_CARD, anchor: CENTRE }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'alias-target-not-found', targetId: UNKNOWN_CARD },
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
            positions: {
              [CARD_A]: { x: 20, y: 30, open: false },
              [CARD_B]: { x: 310, y: 50, open: false },
            },
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

describe('Rename Layout', () => {
  it('trims and replaces only the Layout title', () => {
    const { authoring, session } = openPositioned();
    const before = layoutOf(session.getState().working, LAYOUT_ID);

    expect(
      authoring.complete({ kind: 'renamed-layout', layoutId: LAYOUT_ID, title: '  Workshop  ' }),
    ).toEqual({
      kind: 'completed',
    });
    const after = layoutOf(session.getState().working, LAYOUT_ID);
    expect(after?.title).toBe('Workshop');
    expect(after?.id).toBe(before?.id);
    expect(after?.positions).toEqual(before?.positions);
    expect(after?.graphs).toEqual(before?.graphs);
  });

  it('refuses a blank title and treats the stored title with padding as unchanged', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({ kind: 'renamed-layout', layoutId: LAYOUT_ID, title: '   ' }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'layout-title-required' },
    });
    expect(session.getState().working).toBe(before);
    expect(
      authoring.complete({ kind: 'renamed-layout', layoutId: LAYOUT_ID, title: ' Layout 1 ' }),
    ).toEqual({
      kind: 'unchanged',
    });
  });

  /**
   * The Edit is addressed by Layout id, as Rename Graph is by Graph id. Without
   * that the rename lands on whichever Layout the resolver happens to answer,
   * so a draft begun on one Layout and completed after the drawing Layout
   * changed writes the title onto a Layout the author never named.
   */
  it('refuses a rename addressed to a Layout other than the one drawing', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(
      authoring.complete({ kind: 'renamed-layout', layoutId: OTHER_LAYOUT_ID, title: 'Workshop' }),
    ).toEqual({
      kind: 'refused',
      refusal: { code: 'layout-not-found' },
    });
    expect(session.getState().working).toBe(before);
  });
});

describe('Delete Layout', () => {
  const otherGraph: Graph = { id: OTHER_GRAPH_ID, title: 'Aside', edges: [] };
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
          positions: {
            [CARD_B]: {
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

  it('deletes only the selected Layout and continues in the first survivor', () => {
    const { authoring, navigation, session } = open(twoLayouts, OTHER_LAYOUT_ID);
    place(authoring, { [CARD_B]: [80, 90] });

    expect(authoring.complete({ kind: 'deleted-layout', layoutId: OTHER_LAYOUT_ID })).toEqual({
      kind: 'completed',
    });

    expect(session.getState().working.cards).toEqual(twoLayouts.cards);
    expect(session.getState().working.document.layouts).toEqual([
      positionedSnapshot.document.layouts![0]!,
    ]);
    expect(navigation.getState().selectedLayoutId).toBe(LAYOUT_ID);
    expect(navigation.getState().activeGraphId).toBe(GRAPH_ID);
    expect(authoring.authoredPlacement()?.get(CARD_A)).toEqual({ x: 10, y: 20, open: false });
  });

  it('refuses to delete the last Layout with a stable identity', () => {
    const { authoring, session } = openPositioned();
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-layout', layoutId: LAYOUT_ID })).toEqual({
      kind: 'refused',
      refusal: { code: 'space-must-keep-layout' },
    });
    expect(session.getState().working).toBe(before);
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
      refusal: { code: 'layout-must-keep-graph' },
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
            positions: { [CARD_A]: { x: 0, y: 400, open: false } },
            graphs: [{ id: OTHER_GRAPH_ID, title: 'Aside', edges: [] }],
          },
        ],
      },
    };
    const { authoring } = open(twoLayouts);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });

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
              [CARD_A]: { x: 10, y: 20, open: false },
              [CARD_B]: { x: 300, y: 40, open: false },
              [CARD_C]: { x: 600, y: 40, open: false },
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
    ).toEqual({ kind: 'refused', refusal: { code: 'edge-already-exists' } });
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
    ).toEqual({ kind: 'refused', refusal: { code: 'edge-card-outside-layout' } });
  });

  it('refuses an Edge the Graph no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({
        kind: 'deleted-edge',
        graphId: GRAPH_ID,
        edge: { from: CARD_B, to: CARD_A },
      }),
    ).toEqual({ kind: 'refused', refusal: { code: 'edge-not-found' } });
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
    [CARD_A, { x: 10, y: 20, open: false }],
    [CARD_B, { x: 300, y: 40, open: false }],
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

    const refusal = { kind: 'refused', refusal: { code: 'edge-already-exists' } };
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
      refusal: { code: 'edge-card-outside-layout' },
    });
    expect(authoring.edgeEligibility({ kind: 'create-and-connect', from: CARD_C })).toEqual({
      kind: 'refused',
      refusal: { code: 'edge-card-outside-layout' },
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

    const refusal = { kind: 'refused', refusal: { code: 'edge-card-outside-layout' } };
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

    const refusal = { kind: 'refused', refusal: { code: 'edge-card-outside-layout' } };
    expect(authoring.edgeEligibility({ ...RECONNECT, cardId: UNKNOWN_CARD })).toEqual(refusal);
    expect(
      authoring.complete({ ...RECONNECT, kind: 'reconnected-edge', cardId: UNKNOWN_CARD }),
    ).toEqual(refusal);
  });

  it('refuses a reconnection naming a Graph this Layout does not own', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.edgeEligibility({ ...RECONNECT, graphId: UNKNOWN_GRAPH, cardId: CARD_A }),
    ).toEqual({ kind: 'refused', refusal: { code: 'graph-not-owned' } });
  });

  /**
   * The completion has to re-ask the rule, and this is the case where dropping
   * it would go unnoticed: an Edge the Graph no longer holds indexes at `-1`, so
   * the `map` that writes the reconnection replaces nothing and the Edit answers
   * as though it had — `unchanged` when the snapshot is otherwise untouched,
   * `completed` when writing the Layout back settles something else, and the
   * refusal the author is owed never said either way.
   */
  it('refuses an Edge the Graph no longer holds, and completes the same way', () => {
    const { authoring } = openPositioned();
    const absent = { ...RECONNECT, edge: { from: CARD_B, to: CARD_A }, cardId: CARD_A } as const;

    const refusal = { kind: 'refused', refusal: { code: 'edge-not-found' } };
    expect(authoring.edgeEligibility(absent)).toEqual(refusal);
    expect(authoring.complete({ ...absent, kind: 'reconnected-edge' })).toEqual(refusal);
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
      [CARD_A]: { x: 10, y: 20, open: false },
      [CARD_B]: { x: 300, y: 40, open: false },
      [CARD_C]: CENTRE,
    });
    expect(graphsOf(session.getState().working)).toEqual([MAIN_GRAPH]);
  });

  it('places a Card added to a Layout at the anchor given, whatever is Open', () => {
    const expandedSparse: SpaceSnapshot = {
      ...sparse,
      document: {
        ...sparse.document,
        layouts: [
          {
            ...sparse.document.layouts![0]!,
            positions: {
              [CARD_A]: { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } },
              [CARD_B]: { x: 300, y: 40, open: false },
            },
          },
        ],
      },
    };
    const { authoring, session } = open(expandedSparse);
    authoring.replacePlacement(
      Placement.fromEntries([
        [CARD_A, { x: 10, y: 20, open: true, openSize: { width: 560, height: 420 } }],
        [CARD_B, { x: 300, y: 40, open: false }],
      ]),
    );

    authoring.complete({
      kind: 'added-card-to-layout',
      cardId: CARD_C,
      anchor: { x: 500, y: 400 },
    });

    // As above: the anchor is authorship, not a drawn coordinate to invert.
    expect(layoutOf(session.getState().working, LAYOUT_ID)?.positions[CARD_C]).toEqual({
      x: 500,
      y: 400,
      open: false,
    });
  });

  it('refuses a Card the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'added-card-to-layout', cardId: UNKNOWN_CARD, anchor: CENTRE }),
    ).toEqual({ kind: 'refused', refusal: { code: 'card-not-found' } });
  });

  it('refuses a Card the Layout already holds', () => {
    const { authoring } = openPositioned();

    expect(
      authoring.complete({ kind: 'added-card-to-layout', cardId: CARD_A, anchor: CENTRE }),
    ).toEqual({ kind: 'refused', refusal: { code: 'card-already-in-layout' } });
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
            positions: {
              [CARD_A]: { x: 0, y: 400, open: false },
              [CARD_B]: { x: 0, y: 600, open: false },
            },
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
    expect(layoutOf(working, LAYOUT_ID)?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20, open: false },
    });
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
      refusal: { code: 'card-not-in-layout' },
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
          positions: {
            [CARD_A]: { x: 0, y: 400, open: false },
            [CARD_B]: { x: 0, y: 600, open: false },
          },
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
    expect(layoutOf(working, LAYOUT_ID)?.positions).toEqual({
      [CARD_A]: { x: 10, y: 20, open: false },
    });
    expect(layoutOf(working, LAYOUT_ID)?.graphs).toEqual([{ ...MAIN_GRAPH, edges: [] }]);
    expect(layoutOf(working, OTHER_LAYOUT_ID)?.positions).toEqual({
      [CARD_A]: { x: 0, y: 400, open: false },
    });
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
      refusal: {
        code: 'card-has-aliases',
        aliasTitles: ['A again'],
      },
    });
    expect(session.getState().working).toBe(before);
  });

  /*
   * A Space Card owns the Space it names (ADR 0058), so deleting it deletes
   * that Space and the closure below it — one coordinated multi-Space Edit,
   * which is the session registry's and not a single-Space update this seam can
   * make. Completing it here stores a Space whose target is unreachable, and
   * aggregate intake refuses that commit permanently with the Card already gone
   * from the working state, leaving the author nothing to correct.
   */
  it('refuses deleting a Space Card rather than orphaning the Space it owns', () => {
    const linked: SpaceSnapshot = {
      ...positionedSnapshot,
      cards: [
        positionedSnapshot.cards[0]!,
        { id: CARD_B, document: { title: 'Nested Space', kind: 'space', spaceId: UNKNOWN_CARD } },
      ],
    };
    const { authoring, session } = open(linked);
    place(authoring, { [CARD_A]: [10, 20], [CARD_B]: [300, 40] });
    const before = session.getState().working;

    expect(authoring.complete({ kind: 'deleted-card', cardId: CARD_B })).toEqual({
      kind: 'refused',
      refusal: { code: 'space-card-deletion-unsupported' },
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

  it('refuses a Card the Space no longer holds', () => {
    const { authoring } = openPositioned();

    expect(authoring.complete({ kind: 'deleted-card', cardId: UNKNOWN_CARD })).toEqual({
      kind: 'refused',
      refusal: { code: 'card-not-found' },
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
    const { authoring } = composeApp({
      spaceSession: session,
      selection: LAYOUT_ID,
      initialPlacement: null,
    });
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
    ).toEqual({ kind: 'refused', refusal: { code: 'graph-not-owned' } });
  });
});
