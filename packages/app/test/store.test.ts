import { describe, expect, it } from 'vitest';
import { uuidSchema, type UUID } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import { createSpaceStore, type Move, type SpaceStore } from '../src/store';
import { cardFile } from './card-files';

const uuid = (value: string): UUID => uuidSchema.parse(value);

function fixture(): Space {
  const result = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fixture',
      routes: [
        {
          id: uuid('00000000-0000-4000-8000-000000000032'),
          title: 'One',
          edges: [
            {
              from: uuid('00000000-0000-4000-8000-000000000002'),
              to: uuid('00000000-0000-4000-8000-000000000003'),
            },
            {
              from: uuid('00000000-0000-4000-8000-000000000003'),
              to: uuid('00000000-0000-4000-8000-000000000005'),
            },
          ],
        },
        {
          id: uuid('00000000-0000-4000-8000-000000000033'),
          title: 'Two',
          edges: [
            {
              from: uuid('00000000-0000-4000-8000-000000000003'),
              to: uuid('00000000-0000-4000-8000-000000000005'),
            },
          ],
        },
      ],
    },
    [
      cardFile(uuid('00000000-0000-4000-8000-000000000002')),
      cardFile(uuid('00000000-0000-4000-8000-000000000003')),
      cardFile(uuid('00000000-0000-4000-8000-000000000005')),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('createSpaceStore', () => {
  it('opens on the route it is handed, rather than picking one', () => {
    // Which route opens active is resolved from the Layout (ADR 0026) and passed
    // in. A store that reached for `space.routes[0]` would answer that a second
    // time and disagree the moment a Layout filters — so `r2`, not `r1`.
    const { useStore } = createSpaceStore(fixture(), uuid('00000000-0000-4000-8000-000000000033'));
    expect(useStore.getState().activeRouteId).toBe(uuid('00000000-0000-4000-8000-000000000033'));
  });

  it('activates a different route', () => {
    const { useStore } = createSpaceStore(fixture(), uuid('00000000-0000-4000-8000-000000000032'));
    useStore.getState().activateRoute(uuid('00000000-0000-4000-8000-000000000033'));
    expect(useStore.getState().activeRouteId).toBe(uuid('00000000-0000-4000-8000-000000000033'));
  });

  it('opens another renderer on its resolved route without recording a walk', () => {
    const { useStore } = createSpaceStore(fixture(), uuid('00000000-0000-4000-8000-000000000032'));
    useStore.getState().present();

    useStore.getState().openRenderer(null);

    expect(useStore.getState()).toMatchObject({
      activeRouteId: null,
      mode: 'overview',
      walk: [],
      branchIndex: 0,
    });
  });

  it('carries no active route in a space with none (ADR 0015)', () => {
    const result = loadSpace(
      {
        version: 2,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'New space',
        routes: [],
      },
      [cardFile(uuid('00000000-0000-4000-8000-000000000002'), 'Untitled')],
    );
    if (!result.ok) throw new Error('a route-less space should load');
    const { useStore } = createSpaceStore(result.space, null);
    expect(useStore.getState().activeRouteId).toBeNull();
  });

  it('opens and closes a card independently of the active route', () => {
    const { useStore } = createSpaceStore(fixture(), uuid('00000000-0000-4000-8000-000000000032'));
    useStore.getState().openCard(uuid('00000000-0000-4000-8000-000000000005'));
    expect(useStore.getState()).toMatchObject({
      openedCardId: uuid('00000000-0000-4000-8000-000000000005'),
      activeRouteId: uuid('00000000-0000-4000-8000-000000000032'),
    });
    useStore.getState().closeCard();
    expect(useStore.getState().openedCardId).toBeNull();
  });
});

/**
 * A route that forks at `a` and merges at `d`: `a → b → d` and `a → c → d`.
 * Every move a walk can make is exercised against it — a choice, a plain step,
 * and a card arrived at two ways.
 */
function forked(): Space {
  const result = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Forked',
      routes: [
        {
          id: uuid('00000000-0000-4000-8000-000000000004'),
          title: 'Main',
          edges: [
            {
              from: uuid('00000000-0000-4000-8000-000000000002'),
              to: uuid('00000000-0000-4000-8000-000000000003'),
            },
            {
              from: uuid('00000000-0000-4000-8000-000000000002'),
              to: uuid('00000000-0000-4000-8000-000000000005'),
            },
            {
              from: uuid('00000000-0000-4000-8000-000000000003'),
              to: uuid('00000000-0000-4000-8000-000000000006'),
            },
            {
              from: uuid('00000000-0000-4000-8000-000000000005'),
              to: uuid('00000000-0000-4000-8000-000000000006'),
            },
          ],
        },
      ],
    },
    [
      cardFile(uuid('00000000-0000-4000-8000-000000000002')),
      cardFile(uuid('00000000-0000-4000-8000-000000000003')),
      cardFile(uuid('00000000-0000-4000-8000-000000000005')),
      cardFile(uuid('00000000-0000-4000-8000-000000000006')),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

/** The moves the chrome would draw for the store's current state. */
function moves(
  useStore: SpaceStore['useStore'],
  selectActiveCardId: SpaceStore['selectActiveCardId'],
  movesFrom: SpaceStore['movesFrom'],
): Move[] {
  const state = useStore.getState();
  return movesFrom(state.activeRouteId, selectActiveCardId(state), state.branchIndex);
}

describe('walking a route (ADR 0027)', () => {
  it('uses an installed Space for the choices and destination of an active walk', () => {
    const routeId = uuid('00000000-0000-4000-8000-000000000032');
    const cardA = uuid('00000000-0000-4000-8000-000000000002');
    const cardB = uuid('00000000-0000-4000-8000-000000000003');
    const cardC = uuid('00000000-0000-4000-8000-000000000005');
    const initial = fixture();
    const updated = loadSpace(
      {
        version: 2,
        id: initial.id,
        title: initial.title,
        routes: [
          {
            id: routeId,
            title: 'One',
            edges: [
              { from: cardA, to: cardB },
              { from: cardA, to: cardC },
              { from: cardB, to: cardC },
            ],
          },
          initial.routes[1]!,
        ],
      },
      [cardFile(cardA), cardFile(cardB), cardFile(cardC, 'New destination')],
    );
    if (!updated.ok) throw new Error('updated fixture should load');
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(initial, routeId);
    useStore.getState().present();

    useStore.getState().installSpace(updated.space);

    expect(moves(useStore, selectActiveCardId, movesFrom)).toEqual([
      { cardId: cardB, title: 'B', selected: true },
      { cardId: cardC, title: 'New destination', selected: false },
    ]);
    useStore.getState().selectBranch(1);
    expect(moves(useStore, selectActiveCardId, movesFrom)[1]?.selected).toBe(true);
    useStore.getState().advance();
    expect(selectActiveCardId(useStore.getState())).toBe(cardC);
  });

  it('traverses an Edge added to its current Space', () => {
    const initial = fixture();
    const updated = loadSpace(
      {
        version: 2,
        id: initial.id,
        title: initial.title,
        routes: [
          {
            id: uuid('00000000-0000-4000-8000-000000000032'),
            title: 'One',
            edges: [
              {
                from: uuid('00000000-0000-4000-8000-000000000002'),
                to: uuid('00000000-0000-4000-8000-000000000003'),
              },
              {
                from: uuid('00000000-0000-4000-8000-000000000003'),
                to: uuid('00000000-0000-4000-8000-000000000005'),
              },
              {
                from: uuid('00000000-0000-4000-8000-000000000002'),
                to: uuid('00000000-0000-4000-8000-000000000005'),
              },
            ],
          },
          initial.routes[1]!,
        ],
      },
      [
        cardFile(uuid('00000000-0000-4000-8000-000000000002')),
        cardFile(uuid('00000000-0000-4000-8000-000000000003')),
        cardFile(uuid('00000000-0000-4000-8000-000000000005')),
      ],
    );
    if (!updated.ok) throw new Error('updated fixture should load');
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(
      initial,
      uuid('00000000-0000-4000-8000-000000000032'),
    );

    useStore.getState().installSpace(updated.space);
    useStore.getState().present();
    expect(moves(useStore, selectActiveCardId, movesFrom)).toEqual([
      { cardId: uuid('00000000-0000-4000-8000-000000000003'), title: 'B', selected: true },
      { cardId: uuid('00000000-0000-4000-8000-000000000005'), title: 'C', selected: false },
    ]);

    useStore.getState().selectBranch(1);
    useStore.getState().advance();
    useStore.getState().retreat();
    useStore.getState().advance();
    expect(selectActiveCardId(useStore.getState())).toBe(
      uuid('00000000-0000-4000-8000-000000000005'),
    );
  });

  it('starts at the entry card of its current Space', () => {
    const routeId = uuid('00000000-0000-4000-8000-000000000032');
    const cardA = uuid('00000000-0000-4000-8000-000000000002');
    const cardB = uuid('00000000-0000-4000-8000-000000000003');
    const cardC = uuid('00000000-0000-4000-8000-000000000005');
    const initial = loadSpace(
      {
        version: 2,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Initial',
        routes: [{ id: routeId, title: 'Main', edges: [{ from: cardA, to: cardB }] }],
      },
      [cardFile(cardA), cardFile(cardB), cardFile(cardC)],
    );
    const updated = loadSpace(
      {
        version: 2,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'Updated',
        routes: [
          {
            id: routeId,
            title: 'Main',
            edges: [
              { from: cardC, to: cardA },
              { from: cardA, to: cardB },
            ],
          },
        ],
      },
      [cardFile(cardA), cardFile(cardB), cardFile(cardC)],
    );
    if (!initial.ok || !updated.ok) throw new Error('entry fixtures should load');
    const { useStore, selectActiveCardId } = createSpaceStore(initial.space, routeId);

    useStore.getState().installSpace(updated.space);
    useStore.getState().present();

    expect(selectActiveCardId(useStore.getState())).toBe(cardC);
  });

  it('starts at the route’s entry card', () => {
    const { useStore, selectActiveCardId } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    expect(selectActiveCardId(useStore.getState())).toBeNull(); // overview
    useStore.getState().present();
    expect(useStore.getState().mode).toBe('presenting');
    expect(selectActiveCardId(useStore.getState())).toBe(
      uuid('00000000-0000-4000-8000-000000000002'),
    );
  });

  it('will not present a space with no routes (ADR 0015)', () => {
    const result = loadSpace(
      {
        version: 2,
        id: uuid('00000000-0000-4000-8000-000000000001'),
        title: 'New space',
        routes: [],
      },
      [cardFile(uuid('00000000-0000-4000-8000-000000000002'), 'Untitled')],
    );
    if (!result.ok) throw new Error('a route-less space should load');
    const { useStore } = createSpaceStore(result.space, null);
    useStore.getState().present();
    expect(useStore.getState().mode).toBe('overview');
  });

  it('offers a fork’s outgoing edges, the first selected', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    expect(moves(useStore, selectActiveCardId, movesFrom)).toEqual([
      { cardId: uuid('00000000-0000-4000-8000-000000000003'), title: 'B', selected: true },
      { cardId: uuid('00000000-0000-4000-8000-000000000005'), title: 'C', selected: false },
    ]);
  });

  it('moves the selection without moving the camera', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    useStore.getState().selectBranch(1);
    // The move a deck framework's per-key redirect cannot express: the selection
    // changed and the walk did not.
    expect(selectActiveCardId(useStore.getState())).toBe(
      uuid('00000000-0000-4000-8000-000000000002'),
    );
    expect(moves(useStore, selectActiveCardId, movesFrom).find((m) => m.selected)?.cardId).toBe(
      uuid('00000000-0000-4000-8000-000000000005'),
    );
  });

  it('wraps the selection rather than sticking at the ends', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    useStore.getState().selectBranch(-1);
    expect(moves(useStore, selectActiveCardId, movesFrom).find((m) => m.selected)?.cardId).toBe(
      uuid('00000000-0000-4000-8000-000000000005'),
    );
  });

  it('advances along the selected edge', () => {
    const { useStore, selectActiveCardId } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    useStore.getState().selectBranch(1);
    useStore.getState().advance();
    expect(selectActiveCardId(useStore.getState())).toBe(
      uuid('00000000-0000-4000-8000-000000000005'),
    );
    expect(useStore.getState().walk).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
  });

  it('treats a card with one outgoing edge as a one-member choice', () => {
    // No `isLinear` anywhere (ADR 0024) — advancing at `b` works because the
    // selection has one member, not because the code noticed the route is a line.
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    useStore.getState().advance();
    expect(moves(useStore, selectActiveCardId, movesFrom)).toHaveLength(1);
    useStore.getState().selectBranch(1); // nothing to move through
    useStore.getState().advance();
    expect(selectActiveCardId(useStore.getState())).toBe(
      uuid('00000000-0000-4000-8000-000000000006'),
    );
  });

  it('stays put at a sink', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    useStore.getState().advance();
    useStore.getState().advance();
    expect(selectActiveCardId(useStore.getState())).toBe(
      uuid('00000000-0000-4000-8000-000000000006'),
    );
    expect(moves(useStore, selectActiveCardId, movesFrom)).toEqual([]);
    useStore.getState().advance();
    expect(useStore.getState().walk).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000003'),
      uuid('00000000-0000-4000-8000-000000000006'),
    ]);
  });

  it('goes back along the walk, not the graph', () => {
    // `d` is reached by two edges. Which one was used is only in the path taken,
    // so back has to read the walk — via `c` here, though `b → d` exists too.
    const { useStore, selectActiveCardId } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    useStore.getState().selectBranch(1);
    useStore.getState().advance();
    useStore.getState().advance();
    expect(useStore.getState().walk).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000005'),
      uuid('00000000-0000-4000-8000-000000000006'),
    ]);
    useStore.getState().retreat();
    expect(selectActiveCardId(useStore.getState())).toBe(
      uuid('00000000-0000-4000-8000-000000000005'),
    );
  });

  it('re-selects the edge it walked back over, so back-then-forward is a no-op', () => {
    const { useStore } = createSpaceStore(forked(), uuid('00000000-0000-4000-8000-000000000004'));
    useStore.getState().present();
    useStore.getState().selectBranch(1); // choose c
    useStore.getState().advance();
    useStore.getState().retreat();
    useStore.getState().advance();
    expect(useStore.getState().walk).toEqual([
      uuid('00000000-0000-4000-8000-000000000002'),
      uuid('00000000-0000-4000-8000-000000000005'),
    ]);
  });

  it('will not go back past the card it started from', () => {
    const { useStore, selectActiveCardId } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    useStore.getState().retreat();
    expect(selectActiveCardId(useStore.getState())).toBe(
      uuid('00000000-0000-4000-8000-000000000002'),
    );
  });

  it('ends the walk when the route changes, rather than stranding it', () => {
    const { useStore, selectActiveCardId } = createSpaceStore(
      fixture(),
      uuid('00000000-0000-4000-8000-000000000032'),
    );
    useStore.getState().present();
    useStore.getState().advance();
    useStore.getState().activateRoute(uuid('00000000-0000-4000-8000-000000000033'));
    expect(useStore.getState().mode).toBe('overview');
    expect(selectActiveCardId(useStore.getState())).toBeNull();
  });

  it('drops the walk on returning to the overview', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(
      forked(),
      uuid('00000000-0000-4000-8000-000000000004'),
    );
    useStore.getState().present();
    useStore.getState().advance();
    useStore.getState().exitPresenting();
    expect(useStore.getState().walk).toEqual([]);
    expect(selectActiveCardId(useStore.getState())).toBeNull();
    expect(moves(useStore, selectActiveCardId, movesFrom)).toEqual([]);
  });

  it('closes an opened card when presenting starts', () => {
    const { useStore } = createSpaceStore(forked(), uuid('00000000-0000-4000-8000-000000000004'));
    useStore.getState().openCard(uuid('00000000-0000-4000-8000-000000000006'));
    useStore.getState().present();
    expect(useStore.getState().openedCardId).toBeNull();
  });
});
