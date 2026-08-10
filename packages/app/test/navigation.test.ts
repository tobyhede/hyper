import { expect, expectTypeOf, it, vi } from 'vitest';
import { uuidSchema, type CardId, type GraphId, type UUID } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import { createNavigation, type NavigationState } from '../src/navigation';
import { cardFile } from './card-files';

const uuid = (value: string): UUID => uuidSchema.parse(value);

/**
 * Traversal history belongs to a presenting state. Reading it requires narrowing, which is the
 * point of the split: a state that is not presenting has no Traversal history to read, here
 * or anywhere else.
 */
function traversalHistoryOf(state: NavigationState): readonly CardId[] {
  if (state.mode !== 'presenting') throw new Error('navigation should be presenting');
  return state.traversalHistory;
}

const GRAPH_ONE = uuid('00000000-0000-4000-8000-000000000031');
const GRAPH_TWO = uuid('00000000-0000-4000-8000-000000000032');
const LAYOUT = uuid('00000000-0000-4000-8000-000000000041');

function fixture(): Space {
  const result = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fixture',
      graphs: [
        {
          id: GRAPH_ONE,
          title: 'One',
          edges: [
            {
              from: uuid('00000000-0000-4000-8000-000000000002'),
              to: uuid('00000000-0000-4000-8000-000000000003'),
            },
          ],
        },
        {
          id: GRAPH_TWO,
          title: 'Two',
          edges: [
            {
              from: uuid('00000000-0000-4000-8000-000000000003'),
              to: uuid('00000000-0000-4000-8000-000000000004'),
            },
          ],
        },
      ],
      layouts: [
        {
          id: LAYOUT,
          title: 'Second graph',
          positions: {},
          graphs: [GRAPH_TWO],
          activeGraph: GRAPH_TWO,
        },
      ],
    },
    [
      cardFile(uuid('00000000-0000-4000-8000-000000000002')),
      cardFile(uuid('00000000-0000-4000-8000-000000000003')),
      cardFile(uuid('00000000-0000-4000-8000-000000000004')),
    ],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

it('selects a renderer and its active Graph without changing the Space', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });
  navigation.present();

  navigation.selectRenderer({ kind: 'layout', layoutId: LAYOUT });

  expect(navigation.getState()).toMatchObject({
    selectedRenderer: { kind: 'layout', layoutId: LAYOUT },
    selectedView: 'flow',
    activeGraphId: GRAPH_TWO,
    mode: 'overview',
  });
  expect(navigation.activeCardId()).toBeNull();
  expect(space.defaultView).toBeUndefined();

  navigation.selectRenderer({ kind: 'view', view: 'grid' });
  expect(navigation.getState().selectedView).toBe('grid');
});

/**
 * Selecting a renderer closes an opened Card, and that is a change: this used to
 * retain it, on the reasoning that the author was still *reading* it and the
 * arrangement underneath was none of that reading's business.
 *
 * ADR 0037 removed the reading state, so what is retained now is an editor — and
 * an Algorithmic View installs no placement until its strategy resolves, which
 * is a window in which the Edit that editor completes is refused for having no
 * positions to write. The pane closed on `Done` either way, so a refusal was
 * indistinguishable from success and the author's typing was simply gone.
 *
 * Closing removes the window rather than reporting from inside it. The cost is
 * that a draft is discarded when the author changes what they are looking at —
 * visibly, and at the moment they ask for it, which is what `present()` has
 * always done with an opened Card.
 */
it('closes an opened Card when the renderer changes, so no editor outlives its placement', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });
  navigation.openCard(uuid('00000000-0000-4000-8000-000000000002'));

  navigation.selectRenderer({ kind: 'layout', layoutId: LAYOUT });

  expect(navigation.getState().openedCardId).toBeNull();
});

it('traverses an Edge from the changing working Space without installing a copy', () => {
  const cardA = uuid('00000000-0000-4000-8000-000000000002');
  const cardB = uuid('00000000-0000-4000-8000-000000000003');
  const cardC = uuid('00000000-0000-4000-8000-000000000004');
  let working = fixture();
  const navigation = createNavigation(() => working, { kind: 'view', view: 'flow' });
  navigation.present();

  const changed = loadSpace(
    {
      version: 2,
      id: working.id,
      title: working.title,
      graphs: [
        {
          id: GRAPH_ONE,
          title: 'One',
          edges: [
            { from: cardA, to: cardB },
            { from: cardA, to: cardC },
          ],
        },
        working.graphs[1]!,
      ],
      layouts: working.layouts,
    },
    [cardFile(cardA), cardFile(cardB), cardFile(cardC, 'New destination')],
  );
  if (!changed.ok) throw new Error('changed fixture should load');
  working = changed.space;

  expect(navigation.moves()).toEqual([
    { cardId: cardB, title: 'B', selected: true },
    { cardId: cardC, title: 'New destination', selected: false },
  ]);
  navigation.selectBranch(1);
  navigation.advance();
  expect(navigation.activeCardId()).toBe(cardC);
});

/**
 * A self-connection is the first gesture authoring ships, and the Graph it mints
 * is fully cyclic: every Card it holds is arrived at, so no Card is an entry.
 * Presenting one used to do nothing at all — `graphStartCard` answered nothing,
 * `present()` returned before any state change, and the enabled control that
 * called it swallowed the click.
 */
it('presents a fully cyclic Graph, which has no entry Card', () => {
  const card = uuid('00000000-0000-4000-8000-000000000002');
  const loaded = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Loop',
      graphs: [{ id: GRAPH_ONE, title: 'Loop', edges: [{ from: card, to: card }] }],
    },
    [cardFile(card)],
  );
  if (!loaded.ok) throw new Error('loop should load');
  const navigation = createNavigation(() => loaded.space, { kind: 'view', view: 'flow' });

  navigation.present();

  expect(navigation.getState()).toMatchObject({ mode: 'presenting', traversalHistory: [card] });
  expect(navigation.moves()).toEqual([{ cardId: card, title: 'A', selected: true }]);
});

/*
 * Traversal history may contain the same Card twice. Cycles and self-Edges are legal
 * authored structure (ADR 0032), so a presenter traversing a loop accumulates a
 * history whose Cards repeat and whose last Card can be its first again. The Card
 * being presented is Traversal history's *last* element, never the first occurrence of
 * it — a read that answered the first Card in Traversal history would go on offering the
 * moves out of that Card for the rest of the loop, and the two only diverge once
 * a Card repeats.
 *
 * The other two shapes are pinned already and not repeated here: a one-Card Traversal history
 * is read by "opens and closes Cards…" straight after `present()`, and Traversal history
 * that has advanced by the fork test below.
 */
it('reads the last Card when Traversal history returns to one it has already visited', () => {
  const cardA = uuid('00000000-0000-4000-8000-000000000002');
  const cardB = uuid('00000000-0000-4000-8000-000000000003');
  const loaded = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Cycle',
      graphs: [
        {
          id: GRAPH_ONE,
          title: 'Cycle',
          edges: [
            { from: cardA, to: cardB },
            { from: cardB, to: cardA },
          ],
        },
      ],
    },
    [cardFile(cardA), cardFile(cardB)],
  );
  if (!loaded.ok) throw new Error('cycle should load');
  const navigation = createNavigation(() => loaded.space, { kind: 'view', view: 'flow' });

  navigation.present();
  navigation.advance();
  navigation.advance();

  // Back where it began: Traversal history's last Card is its first, and presenting
  // stands on it rather than merely carrying it at the front.
  expect(traversalHistoryOf(navigation.getState())).toEqual([cardA, cardB, cardA]);
  expect(navigation.activeCardId()).toBe(cardA);
  expect(navigation.moves()).toEqual([{ cardId: cardB, title: 'B', selected: true }]);

  navigation.advance();

  // The case the two answers separate on: Traversal history repeats a Card and its last
  // is no longer its first, so reading the start answers A where the presenter
  // is standing on B. The moves are asserted here rather than only above,
  // because above the last Card *is* the first and both readings agree — this
  // is the only place the Edges offered can tell a correct read from a wrong
  // one, and they are what the presenting chrome puts on screen.
  expect(traversalHistoryOf(navigation.getState())).toEqual([cardA, cardB, cardA, cardB]);
  expect(navigation.activeCardId()).toBe(cardB);
  expect(navigation.moves()).toEqual([{ cardId: cardA, title: 'A', selected: true }]);

  navigation.retreat();
  expect(navigation.activeCardId()).toBe(cardA);
});

/*
 * Traversal history belongs to presenting, and leaving presenting has none to clear. This
 * used to be four hand-written `traversalHistory: []` resets — one per path back to the
 * overview — any of which could have been forgotten without anything noticing
 * until a stale Card was read from history after presentation had ended.
 */
it('leaves no Traversal history behind when presenting ends', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });
  navigation.present();
  navigation.advance();

  navigation.exitPresenting();

  expect(navigation.getState()).toEqual({
    selectedRenderer: { kind: 'view', view: 'flow' },
    selectedView: 'flow',
    activeGraphId: GRAPH_ONE,
    mode: 'overview',
    openedCardId: null,
  });
  expect(navigation.activeCardId()).toBeNull();
});

/*
 * Presenting stands on a Card for as long as it lasts: it begins on the Graph's
 * start Card and `retreat` keeps the first, so Traversal history is non-empty by type
 * rather than by a check at each read.
 */
it('stands on a Card for as long as it is presenting', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });

  navigation.present();

  const state = navigation.getState();
  if (state.mode !== 'presenting')
    throw new Error('present() should have started Traversal history');
  expectTypeOf(state.traversalHistory[0]).toEqualTypeOf<CardId>();
  expect(state.traversalHistory[0]).toBe(uuid('00000000-0000-4000-8000-000000000002'));
});

it('activating a Graph ends the current Traversal history without changing the Space', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });
  navigation.present();

  navigation.activateGraph(GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    activeGraphId: GRAPH_TWO,
    mode: 'overview',
  });
  expect(navigation.activeCardId()).toBeNull();
  expect(space.defaultView).toBeUndefined();
});

it('refuses to activate a Graph the current Space does not hold', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });
  navigation.present();
  const before = navigation.getState();

  // The same invariant `selectRenderer` holds, for the other half of what
  // Navigation names. Activating is not an edit, so it cannot mint the Graph it
  // is handed; a Graph the Space does not hold would strand every later read —
  // `moves()`, `present()` and the emphasis — on a lookup that answers nothing.
  expect(() => navigation.activateGraph(uuid('00000000-0000-4000-8000-000000000099'))).toThrow(
    /does not exist/,
  );
  expect(navigation.getState()).toBe(before);
});

/*
 * The other half of the same question, and the half the guard used to miss. A
 * Layout's `graphs` is a filter, so the resolved view answers a narrower set
 * than the Space holds (ADR 0026) and a Graph can exist without being one this
 * renderer draws. Activating it carried that id into the next completed Edit,
 * which wrote it as the Layout's `activeGraph` — the one combination intake
 * rejects outright. The Edit was then dead: not a conflict and not a retry, a
 * permanent rejection reported at the commit rather than at the gesture that
 * caused it.
 */
it('refuses to activate a Graph the selected renderer does not show', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'layout', layoutId: LAYOUT });
  const before = navigation.getState();

  expect(() => navigation.activateGraph(GRAPH_ONE)).toThrow(/does not show/);
  expect(navigation.getState()).toBe(before);

  // The same Graph under a renderer that filters nothing is fine: what is
  // refused is naming a Graph this view does not draw, never the Graph itself.
  navigation.selectRenderer({ kind: 'view', view: 'flow' });
  navigation.activateGraph(GRAPH_ONE);
  expect(navigation.getState().activeGraphId).toBe(GRAPH_ONE);
});

it('continues the current Traversal history when an Edit converts the renderer to a Layout', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });
  navigation.present();
  const traversalHistory = traversalHistoryOf(navigation.getState());

  navigation.continueInRenderer({ kind: 'layout', layoutId: LAYOUT });

  expect(navigation.getState()).toMatchObject({
    selectedRenderer: { kind: 'layout', layoutId: LAYOUT },
    activeGraphId: GRAPH_ONE,
    mode: 'presenting',
  });
  expect(traversalHistoryOf(navigation.getState())).toBe(traversalHistory);
});

it('notifies subscribers synchronously until they unsubscribe', () => {
  const space = fixture();
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });
  const seen: (GraphId | null)[] = [];
  // The seam `useSyncExternalStore` drives. It must notify during the call that
  // changed the state — React reads `getState` straight after and would
  // otherwise render the previous Navigation state.
  const unsubscribe = navigation.subscribe(() => seen.push(navigation.getState().activeGraphId));

  navigation.activateGraph(GRAPH_TWO);
  expect(seen).toEqual([GRAPH_TWO]);

  navigation.activateGraph(GRAPH_ONE);
  expect(seen).toEqual([GRAPH_TWO, GRAPH_ONE]);

  unsubscribe();
  navigation.activateGraph(GRAPH_TWO);
  expect(seen).toEqual([GRAPH_TWO, GRAPH_ONE]);
});

it('contains a failing subscriber and still notifies the ones behind it', () => {
  const space = fixture();
  const reported: unknown[] = [];
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' }, space, {
    reportObserverError: (error) => reported.push(error),
  });
  const observerError = new Error('observer failed');
  const later = vi.fn();
  navigation.subscribe(() => {
    throw observerError;
  });
  navigation.subscribe(later);
  expect(() => navigation.activateGraph(GRAPH_TWO)).not.toThrow();
  expect(later).toHaveBeenCalledOnce();
  // Identity, not shape. `toEqual` compares an Error by name and message, so a
  // reporter handed any distinct `new Error('observer failed')` satisfied it —
  // including one the publisher manufactured instead of forwarding. What this
  // pins is that the observer's own throw reached the sink, exactly once.
  expect(reported).toHaveLength(1);
  expect(reported[0]).toBe(observerError);
});

it('refuses a renderer the current Space does not hold, leaving navigation untouched', () => {
  const space = fixture();
  const missing = uuid('00000000-0000-4000-8000-000000000099');
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });
  navigation.present();
  const before = navigation.getState();

  // Resolving first is the invariant: Navigation may never name a renderer the
  // Space does not hold, so an unresolvable selection is refused outright rather
  // than half-applied.
  expect(() => navigation.selectRenderer({ kind: 'layout', layoutId: missing })).toThrow(
    /does not exist/,
  );
  expect(navigation.getState()).toBe(before);

  expect(() => navigation.continueInRenderer({ kind: 'layout', layoutId: missing })).toThrow(
    /does not exist/,
  );
  expect(navigation.getState()).toBe(before);
});

it('opens and closes Cards, and closes an opened Card when presenting starts', () => {
  const space = fixture();
  const card = uuid('00000000-0000-4000-8000-000000000003');
  const navigation = createNavigation(() => space, { kind: 'view', view: 'flow' });

  navigation.openCard(card);
  expect(navigation.getState().openedCardId).toBe(card);
  navigation.closeCard();
  expect(navigation.getState().openedCardId).toBeNull();

  navigation.openCard(card);
  navigation.present();
  expect(navigation.getState()).toMatchObject({ mode: 'presenting', openedCardId: null });
  expect(navigation.activeCardId()).toBe(uuid('00000000-0000-4000-8000-000000000002'));
  navigation.exitPresenting();
  expect(navigation.getState()).toMatchObject({ mode: 'overview' });
  expect(navigation.activeCardId()).toBeNull();
});

/*
 * Opening a replacement Space is not navigating to a renderer within the one
 * already open, and the difference is what `selectRenderer` deliberately
 * retains. There is no earlier Algorithmic View to fall back to, so a Layout
 * selection resets `selectedView`, which `selectRenderer` leaves standing.
 * Both clear `openedCardId`; the reason differs, and only this one is about
 * there being no Space left for that Card to belong to.
 */
it('opens a replacement Space as new navigation, retaining no reading state', () => {
  const space = fixture();
  const card = uuid('00000000-0000-4000-8000-000000000003');
  const navigation = createNavigation(() => space, { kind: 'view', view: 'grid' });
  navigation.present();
  navigation.advance();
  navigation.openCard(card);

  navigation.openFresh({ kind: 'layout', layoutId: LAYOUT });

  expect(navigation.getState()).toEqual({
    selectedRenderer: { kind: 'layout', layoutId: LAYOUT },
    selectedView: 'flow',
    activeGraphId: GRAPH_TWO,
    mode: 'overview',
    openedCardId: null,
  });
});

it('reads the working Space once per moves() call, whatever the branching', () => {
  const cardA = uuid('00000000-0000-4000-8000-000000000002');
  const cardB = uuid('00000000-0000-4000-8000-000000000003');
  const cardC = uuid('00000000-0000-4000-8000-000000000004');
  const loaded = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fork',
      graphs: [
        {
          id: GRAPH_ONE,
          title: 'Fork',
          edges: [
            { from: cardA, to: cardB },
            { from: cardA, to: cardC },
          ],
        },
      ],
    },
    [cardFile(cardA), cardFile(cardB), cardFile(cardC)],
  );
  if (!loaded.ok) throw new Error('fork should load');
  // Reading the Space costs a full parse and reindex of the working snapshot,
  // and `moves()` runs during every App render — including the per-pointer-frame
  // renders a drag produces. One read per call, not one per outgoing Edge.
  let reads = 0;
  const navigation = createNavigation(
    () => {
      reads += 1;
      return loaded.space;
    },
    { kind: 'view', view: 'flow' },
    loaded.space,
  );
  navigation.present();

  reads = 0;
  const moves = navigation.moves();

  expect(moves).toHaveLength(2);
  expect(reads).toBe(1);
});

/*
 * The overview answers no moves, and it costs nothing to say so: the mode check
 * sits *above* the read of the Space rather than below it. Overview is the
 * common mode and `moves()` is called at render time, so a read below the guard
 * would pay a parse and reindex of the working snapshot on every render only to
 * hand back an empty array — which is exactly what the flat state did, its
 * `activeCardId()` answering null after the Space had already been read.
 *
 * The answer alone cannot tell the two apart, so this counts the calls to the
 * thunk instead. `createNavigation` reads the Space to resolve its initial
 * renderer, and other members read it too, so what is pinned is that this one
 * call adds nothing rather than that the total is zero.
 */
it('answers no moves outside Traversal history without reading the working Space', () => {
  const space = fixture();
  const currentSpace = vi.fn(() => space);
  const navigation = createNavigation(currentSpace, { kind: 'view', view: 'flow' });

  const before = currentSpace.mock.calls.length;
  const moves = navigation.moves();

  expect(moves).toEqual([]);
  expect(currentSpace).toHaveBeenCalledTimes(before);
});

it('traverses a fork, retreats along Traversal history, and reselects the Edge taken', () => {
  const cardA = uuid('00000000-0000-4000-8000-000000000002');
  const cardB = uuid('00000000-0000-4000-8000-000000000003');
  const cardC = uuid('00000000-0000-4000-8000-000000000004');
  const loaded = loadSpace(
    {
      version: 2,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fork',
      graphs: [
        {
          id: GRAPH_ONE,
          title: 'Fork',
          edges: [
            { from: cardA, to: cardB },
            { from: cardA, to: cardC },
          ],
        },
      ],
    },
    [cardFile(cardA), cardFile(cardB), cardFile(cardC)],
  );
  if (!loaded.ok) throw new Error('fork should load');
  const navigation = createNavigation(() => loaded.space, { kind: 'view', view: 'flow' });
  navigation.present();

  navigation.selectBranch(-1);
  expect(navigation.moves().find((move) => move.selected)?.cardId).toBe(cardC);
  navigation.advance();
  navigation.retreat();

  expect(navigation.activeCardId()).toBe(cardA);
  expect(navigation.moves().find((move) => move.selected)?.cardId).toBe(cardC);
  navigation.advance();
  expect(navigation.activeCardId()).toBe(cardC);
});
