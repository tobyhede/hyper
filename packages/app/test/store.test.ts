import { describe, expect, it } from 'vitest';
import { loadSpace, type Space } from '@project/graph';
import { createSpaceStore, type Move, type SpaceStore } from '../src/store';
import { cardFile } from './card-files';

function fixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: 's',
      title: 'Fixture',
      routes: [
        {
          id: 'r1',
          title: 'One',
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'c' },
          ],
        },
        { id: 'r2', title: 'Two', edges: [{ from: 'b', to: 'c' }] },
      ],
    },
    [cardFile('a'), cardFile('b'), cardFile('c')],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

describe('createSpaceStore', () => {
  it('opens on the route it is handed, rather than picking one', () => {
    // Which route opens active is resolved from the Layout (ADR 0026) and passed
    // in. A store that reached for `space.routes[0]` would answer that a second
    // time and disagree the moment a Layout filters — so `r2`, not `r1`.
    const { useStore } = createSpaceStore(fixture(), 'r2');
    expect(useStore.getState().activeRouteId).toBe('r2');
  });

  it('activates a different route', () => {
    const { useStore } = createSpaceStore(fixture(), 'r1');
    useStore.getState().activateRoute('r2');
    expect(useStore.getState().activeRouteId).toBe('r2');
  });

  it('carries no active route in a space with none (ADR 0015)', () => {
    const result = loadSpace({ version: 1, id: 's', title: 'New space', routes: [] }, [
      cardFile('a', 'Untitled'),
    ]);
    if (!result.ok) throw new Error('a route-less space should load');
    const { useStore } = createSpaceStore(result.space, null);
    expect(useStore.getState().activeRouteId).toBeNull();
  });

  it('opens and closes a card independently of the active route', () => {
    const { useStore } = createSpaceStore(fixture(), 'r1');
    useStore.getState().openCard('c');
    expect(useStore.getState()).toMatchObject({ openedCardId: 'c', activeRouteId: 'r1' });
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
      version: 1,
      id: 's',
      title: 'Forked',
      routes: [
        {
          id: 'main',
          title: 'Main',
          edges: [
            { from: 'a', to: 'b' },
            { from: 'a', to: 'c' },
            { from: 'b', to: 'd' },
            { from: 'c', to: 'd' },
          ],
        },
      ],
    },
    [cardFile('a'), cardFile('b'), cardFile('c'), cardFile('d')],
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
  it('starts at the route’s entry card', () => {
    const { useStore, selectActiveCardId } = createSpaceStore(forked(), 'main');
    expect(selectActiveCardId(useStore.getState())).toBeNull(); // overview
    useStore.getState().present();
    expect(useStore.getState().mode).toBe('presenting');
    expect(selectActiveCardId(useStore.getState())).toBe('a');
  });

  it('will not present a space with no routes (ADR 0015)', () => {
    const result = loadSpace({ version: 1, id: 's', title: 'New space', routes: [] }, [
      cardFile('a', 'Untitled'),
    ]);
    if (!result.ok) throw new Error('a route-less space should load');
    const { useStore } = createSpaceStore(result.space, null);
    useStore.getState().present();
    expect(useStore.getState().mode).toBe('overview');
  });

  it('offers a fork’s outgoing edges, the first selected', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    expect(moves(useStore, selectActiveCardId, movesFrom)).toEqual([
      { cardId: 'b', title: 'B', selected: true },
      { cardId: 'c', title: 'C', selected: false },
    ]);
  });

  it('moves the selection without moving the camera', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().selectBranch(1);
    // The move a deck framework's per-key redirect cannot express: the selection
    // changed and the walk did not.
    expect(selectActiveCardId(useStore.getState())).toBe('a');
    expect(moves(useStore, selectActiveCardId, movesFrom).find((m) => m.selected)?.cardId).toBe(
      'c',
    );
  });

  it('wraps the selection rather than sticking at the ends', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().selectBranch(-1);
    expect(moves(useStore, selectActiveCardId, movesFrom).find((m) => m.selected)?.cardId).toBe(
      'c',
    );
  });

  it('advances along the selected edge', () => {
    const { useStore, selectActiveCardId } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().selectBranch(1);
    useStore.getState().advance();
    expect(selectActiveCardId(useStore.getState())).toBe('c');
    expect(useStore.getState().walk).toEqual(['a', 'c']);
  });

  it('treats a card with one outgoing edge as a one-member choice', () => {
    // No `isLinear` anywhere (ADR 0024) — advancing at `b` works because the
    // selection has one member, not because the code noticed the route is a line.
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().advance();
    expect(moves(useStore, selectActiveCardId, movesFrom)).toHaveLength(1);
    useStore.getState().selectBranch(1); // nothing to move through
    useStore.getState().advance();
    expect(selectActiveCardId(useStore.getState())).toBe('d');
  });

  it('stays put at a sink', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().advance();
    useStore.getState().advance();
    expect(selectActiveCardId(useStore.getState())).toBe('d');
    expect(moves(useStore, selectActiveCardId, movesFrom)).toEqual([]);
    useStore.getState().advance();
    expect(useStore.getState().walk).toEqual(['a', 'b', 'd']);
  });

  it('goes back along the walk, not the graph', () => {
    // `d` is reached by two edges. Which one was used is only in the path taken,
    // so back has to read the walk — via `c` here, though `b → d` exists too.
    const { useStore, selectActiveCardId } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().selectBranch(1);
    useStore.getState().advance();
    useStore.getState().advance();
    expect(useStore.getState().walk).toEqual(['a', 'c', 'd']);
    useStore.getState().retreat();
    expect(selectActiveCardId(useStore.getState())).toBe('c');
  });

  it('re-selects the edge it walked back over, so back-then-forward is a no-op', () => {
    const { useStore } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().selectBranch(1); // choose c
    useStore.getState().advance();
    useStore.getState().retreat();
    useStore.getState().advance();
    expect(useStore.getState().walk).toEqual(['a', 'c']);
  });

  it('will not go back past the card it started from', () => {
    const { useStore, selectActiveCardId } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().retreat();
    expect(selectActiveCardId(useStore.getState())).toBe('a');
  });

  it('ends the walk when the route changes, rather than stranding it', () => {
    const { useStore, selectActiveCardId } = createSpaceStore(fixture(), 'r1');
    useStore.getState().present();
    useStore.getState().advance();
    useStore.getState().activateRoute('r2');
    expect(useStore.getState().mode).toBe('overview');
    expect(selectActiveCardId(useStore.getState())).toBeNull();
  });

  it('drops the walk on returning to the overview', () => {
    const { useStore, selectActiveCardId, movesFrom } = createSpaceStore(forked(), 'main');
    useStore.getState().present();
    useStore.getState().advance();
    useStore.getState().exitPresenting();
    expect(useStore.getState().walk).toEqual([]);
    expect(selectActiveCardId(useStore.getState())).toBeNull();
    expect(moves(useStore, selectActiveCardId, movesFrom)).toEqual([]);
  });

  it('closes an opened card when presenting starts', () => {
    const { useStore } = createSpaceStore(forked(), 'main');
    useStore.getState().openCard('d');
    useStore.getState().present();
    expect(useStore.getState().openedCardId).toBeNull();
  });
});
