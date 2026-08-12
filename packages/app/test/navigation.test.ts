import { expect, expectTypeOf, it, vi } from 'vitest';
import { uuidSchema, type CardId, type GraphId, type UUID } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import { createNavigation, type NavigationState, type NavigationOptions } from '../src/navigation';
import { createRendererResolver, type RendererSelection } from '../src/renderer';
import { cardFile } from './card-files';

/**
 * Navigation over one composed resolver, the way `createApp` composes it.
 *
 * The identity source is deterministic and never used: nothing Navigation does
 * converts a View (ADR 0028). It is supplied because the resolver takes one at
 * composition, which is the point — Navigation names no identity minting at all.
 */
const resolveRenderer = createRendererResolver({
  newGraphId: () => uuid('00000000-0000-4000-8000-0000000000ff'),
});

const navigationFor = (
  currentSpace: () => Space,
  initialRenderer: RendererSelection,
  initialSpace?: Space,
  options?: NavigationOptions,
) =>
  createNavigation(
    currentSpace,
    resolveRenderer,
    initialRenderer,
    initialSpace ?? currentSpace(),
    options ?? {},
  );

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
const FIRST_LAYOUT = uuid('00000000-0000-4000-8000-000000000040');
const LAYOUT = uuid('00000000-0000-4000-8000-000000000041');
const CARD_A = uuid('00000000-0000-4000-8000-000000000002');
const CARD_B = uuid('00000000-0000-4000-8000-000000000003');
const CARD_C = uuid('00000000-0000-4000-8000-000000000004');

/**
 * Two Layouts, each owning one Graph over its own Cards (ADR 0040).
 *
 * Two rather than one deliberately: it is what makes the flatten an Algorithmic
 * View draws differ from what either Layout draws, so both of Navigation's
 * "does not show" refusals name a real state rather than an impossible one.
 */
function fixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fixture',
      layouts: [
        {
          id: FIRST_LAYOUT,
          title: 'First graph',
          positions: { [CARD_A]: { x: 0, y: 0 }, [CARD_B]: { x: 320, y: 0 } },
          graphs: [{ id: GRAPH_ONE, title: 'One', edges: [{ from: CARD_A, to: CARD_B }] }],
        },
        {
          id: LAYOUT,
          title: 'Second graph',
          positions: { [CARD_B]: { x: 0, y: 200 }, [CARD_C]: { x: 320, y: 200 } },
          graphs: [{ id: GRAPH_TWO, title: 'Two', edges: [{ from: CARD_B, to: CARD_C }] }],
          activeGraph: GRAPH_TWO,
        },
      ],
    },
    [cardFile(CARD_A), cardFile(CARD_B), cardFile(CARD_C)],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

/**
 * One Layout owning the given Graphs over the given Cards, which is the fewest
 * moving parts a Space with any structure at all has under ADR 0040. Every Card
 * named is a member, so the Layout's Edges are closed over it by construction.
 */
function spaceOwning(
  title: string,
  graphs: readonly { id: UUID; title: string; edges: readonly { from: UUID; to: UUID }[] }[],
  cards: readonly { id: UUID; title?: string }[],
): Space {
  const loaded = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title,
      layouts: [
        {
          id: FIRST_LAYOUT,
          title: 'Only',
          positions: Object.fromEntries(
            cards.map((card, index) => [card.id, { x: index * 320, y: 0 }]),
          ),
          graphs,
        },
      ],
    },
    cards.map((card) =>
      card.title === undefined ? cardFile(card.id) : cardFile(card.id, card.title),
    ),
  );
  if (!loaded.ok)
    throw new Error(`${title} should load: ${loaded.errors.map((e) => e.message).join('; ')}`);
  return loaded.space;
}

it('selects a renderer and its active Graph without changing the Space', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
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
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
  navigation.openCard(uuid('00000000-0000-4000-8000-000000000002'));

  navigation.selectRenderer({ kind: 'layout', layoutId: LAYOUT });

  expect(navigation.getState().openedCardId).toBeNull();
});

it('traverses an Edge from the changing working Space without installing a copy', () => {
  const cardA = uuid('00000000-0000-4000-8000-000000000002');
  const cardB = uuid('00000000-0000-4000-8000-000000000003');
  const cardC = uuid('00000000-0000-4000-8000-000000000004');
  let working = fixture();
  const navigation = navigationFor(() => working, { kind: 'view', view: 'flow' });
  navigation.present();

  // The same Space with a second Edge out of A, authored into the Graph the
  // first Layout owns — which means C joins that Layout's membership too.
  const changed = loadSpace(
    {
      version: 1,
      id: working.id,
      title: working.title,
      layouts: [
        {
          id: FIRST_LAYOUT,
          title: 'First graph',
          positions: {
            [cardA]: { x: 0, y: 0 },
            [cardB]: { x: 320, y: 0 },
            [cardC]: { x: 640, y: 0 },
          },
          graphs: [
            {
              id: GRAPH_ONE,
              title: 'One',
              edges: [
                { from: cardA, to: cardB },
                { from: cardA, to: cardC },
              ],
            },
          ],
        },
        working.layouts[1]!,
      ],
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
  const space = spaceOwning(
    'Loop',
    [{ id: GRAPH_ONE, title: 'Loop', edges: [{ from: card, to: card }] }],
    [{ id: card }],
  );
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });

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
  const space = spaceOwning(
    'Cycle',
    [
      {
        id: GRAPH_ONE,
        title: 'Cycle',
        edges: [
          { from: cardA, to: cardB },
          { from: cardB, to: cardA },
        ],
      },
    ],
    [{ id: cardA }, { id: cardB }],
  );
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });

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
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
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
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });

  navigation.present();

  const state = navigation.getState();
  if (state.mode !== 'presenting')
    throw new Error('present() should have started Traversal history');
  expectTypeOf(state.traversalHistory[0]).toEqualTypeOf<CardId>();
  expect(state.traversalHistory[0]).toBe(uuid('00000000-0000-4000-8000-000000000002'));
});

it('activating a Graph ends the current Traversal history without changing the Space', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
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
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
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
 * Adopting the renderer an Edit wrote carries its Active Graph with it, because
 * under ADR 0040 a Layout and the Graph it opens on are one answer the Edit
 * produced — a conversion mints the Graph the new Layout owns, and the Graph
 * that was merely emphasised on the Algorithmic View belongs to somebody else.
 *
 * What the test is for is unchanged, and is the thing `selectRenderer` does not
 * do: adopting the Layout an Edit created continues the traversal rather than
 * ending it, down to the same Traversal history array.
 */
it('continues the current Traversal history when an Edit converts the renderer to a Layout', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
  navigation.activateGraph(GRAPH_TWO);
  navigation.present();
  const traversalHistory = traversalHistoryOf(navigation.getState());

  navigation.continueInRenderer({ kind: 'layout', layoutId: LAYOUT }, GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    selectedRenderer: { kind: 'layout', layoutId: LAYOUT },
    activeGraphId: GRAPH_TWO,
    mode: 'presenting',
  });
  expect(traversalHistoryOf(navigation.getState())).toBe(traversalHistory);
});

/**
 * The shape every conversion has, and the reason the Active Graph is an argument
 * rather than something carried over. The Flow view is emphasising `GRAPH_ONE`,
 * which the Layout the Edit wrote does not own; what the Layout does own is the
 * Graph that same Edit minted, and adopting it replaces the emphasis rather than
 * being refused for disagreeing with it (ADR 0045).
 */
it('takes the adopted renderer’s own Active Graph over the one that was emphasised', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
  expect(navigation.getState().activeGraphId).toBe(GRAPH_ONE);

  navigation.continueInRenderer({ kind: 'layout', layoutId: LAYOUT }, GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    selectedRenderer: { kind: 'layout', layoutId: LAYOUT },
    activeGraphId: GRAPH_TWO,
  });
});

/**
 * The refusal that ADR 0040 restored. A Layout draws only the Graphs it owns, so
 * an Edit handing over a Layout and a Graph that Layout does not own has named a
 * pair Navigation may not hold — the Active Graph would ride into the next Edit
 * as that Layout's `activeGraph`, which intake rejects outright.
 *
 * Constructible against a real Space rather than a hand-built renderer:
 * `GRAPH_ONE` exists and is drawn by the Flow view, and `LAYOUT` simply does not
 * own it. Edit completion cannot reach it, because the pair it passes is the one
 * it wrote into the snapshot a line earlier.
 */
it('refuses to adopt a renderer that does not draw the Graph handed with it', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
  navigation.present();
  const before = navigation.getState();

  expect(() =>
    navigation.continueInRenderer({ kind: 'layout', layoutId: LAYOUT }, GRAPH_ONE),
  ).toThrow(/does not show the active Graph/);
  expect(navigation.getState()).toBe(before);
});

/**
 * The same refusal from the other side, and the second one ticket 01 left
 * unreachable. Activating is never an Edit (ADR 0028), so it cannot mint the
 * Graph it is handed — nor move it into the selected Layout. `GraphSelector` is
 * fed the visible Graphs, so this is a caller's mistake rather than an author's.
 */
it('refuses to activate a Graph the selected Layout does not own', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, { kind: 'layout', layoutId: LAYOUT });
  const before = navigation.getState();
  expect(before.activeGraphId).toBe(GRAPH_TWO);

  expect(() => navigation.activateGraph(GRAPH_ONE)).toThrow(/does not show the Graph/);
  expect(navigation.getState()).toBe(before);
});

/*
 * A Space with no Layouts has no Graphs at all (ADR 0040), so there is no Active
 * Graph and no renderer can fail to draw one that was never named. This is the
 * state Edit completion is in when the very first Card an author moves converts
 * an Algorithmic View — except that the conversion has by then minted the Graph,
 * which is why the pair below is the *only* way the null case is reached.
 */
it('adopts a renderer with no active Graph to name', () => {
  const loaded = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Empty',
    },
    [cardFile(CARD_A)],
  );
  if (!loaded.ok) throw new Error('empty fixture should load');
  const navigation = navigationFor(() => loaded.space, { kind: 'view', view: 'flow' });
  expect(navigation.getState().activeGraphId).toBeNull();

  navigation.continueInRenderer({ kind: 'view', view: 'grid' }, null);

  expect(navigation.getState()).toMatchObject({
    selectedRenderer: { kind: 'view', view: 'grid' },
    activeGraphId: null,
  });
});

it('notifies subscribers synchronously until they unsubscribe', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
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
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' }, space, {
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
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });
  navigation.present();
  const before = navigation.getState();

  // Resolving first is the invariant: Navigation may never name a renderer the
  // Space does not hold, so an unresolvable selection is refused outright rather
  // than half-applied.
  expect(() => navigation.selectRenderer({ kind: 'layout', layoutId: missing })).toThrow(
    /does not exist/,
  );
  expect(navigation.getState()).toBe(before);

  expect(() =>
    navigation.continueInRenderer({ kind: 'layout', layoutId: missing }, GRAPH_ONE),
  ).toThrow(/does not exist/);
  expect(navigation.getState()).toBe(before);
});

it('opens and closes Cards, and closes an opened Card when presenting starts', () => {
  const space = fixture();
  const card = uuid('00000000-0000-4000-8000-000000000003');
  const navigation = navigationFor(() => space, { kind: 'view', view: 'flow' });

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
  const navigation = navigationFor(() => space, { kind: 'view', view: 'grid' });
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
  const forked = spaceOwning(
    'Fork',
    [
      {
        id: GRAPH_ONE,
        title: 'Fork',
        edges: [
          { from: cardA, to: cardB },
          { from: cardA, to: cardC },
        ],
      },
    ],
    [{ id: cardA }, { id: cardB }, { id: cardC }],
  );
  // Reading the Space costs a full parse and reindex of the working snapshot,
  // and `moves()` runs during every App render — including the per-pointer-frame
  // renders a drag produces. One read per call, not one per outgoing Edge.
  let reads = 0;
  const navigation = navigationFor(
    () => {
      reads += 1;
      return forked;
    },
    { kind: 'view', view: 'flow' },
    forked,
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
  const navigation = navigationFor(currentSpace, { kind: 'view', view: 'flow' });

  const before = currentSpace.mock.calls.length;
  const moves = navigation.moves();

  expect(moves).toEqual([]);
  expect(currentSpace).toHaveBeenCalledTimes(before);
});

it('traverses a fork, retreats along Traversal history, and reselects the Edge taken', () => {
  const cardA = uuid('00000000-0000-4000-8000-000000000002');
  const cardB = uuid('00000000-0000-4000-8000-000000000003');
  const cardC = uuid('00000000-0000-4000-8000-000000000004');
  const forked = spaceOwning(
    'Fork',
    [
      {
        id: GRAPH_ONE,
        title: 'Fork',
        edges: [
          { from: cardA, to: cardB },
          { from: cardA, to: cardC },
        ],
      },
    ],
    [{ id: cardA }, { id: cardB }, { id: cardC }],
  );
  const navigation = navigationFor(() => forked, { kind: 'view', view: 'flow' });
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
