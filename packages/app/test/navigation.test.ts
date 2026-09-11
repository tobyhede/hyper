import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { uuidSchema, type ThingId, type GraphId, type DiagramId, type UUID } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import {
  canRetreat,
  createNavigation,
  navigationAddress,
  type Navigation,
  type NavigationState,
  type NavigationOptions,
} from '../src/navigation';
import { thingFile } from './thing-files';

const navigationFor = (
  currentSpace: () => Space,
  initialDiagramId: DiagramId,
  initialSpace?: Space,
  options?: NavigationOptions,
) =>
  createNavigation(currentSpace, initialDiagramId, initialSpace ?? currentSpace(), options ?? {});

const uuid = (value: string): UUID => uuidSchema.parse(value);

/**
 * Traversal history belongs to a presenting state. Reading it requires narrowing, which is the
 * point of the split: a state that is not presenting has no Traversal history to read, here
 * or anywhere else.
 */
function traversalHistoryOf(state: NavigationState): readonly ThingId[] {
  if (state.mode !== 'presenting') throw new Error('navigation should be presenting');
  return state.traversalHistory;
}

const GRAPH_ONE = uuid('00000000-0000-4000-8000-000000000031');
const GRAPH_TWO = uuid('00000000-0000-4000-8000-000000000032');
const GRAPH_THREE = uuid('00000000-0000-4000-8000-000000000033');
const FIRST_DIAGRAM = uuid('00000000-0000-4000-8000-000000000040');
const DIAGRAM = uuid('00000000-0000-4000-8000-000000000041');
const THING_A = uuid('00000000-0000-4000-8000-000000000002');
const THING_B = uuid('00000000-0000-4000-8000-000000000003');
const THING_C = uuid('00000000-0000-4000-8000-000000000004');

/**
 * Two Diagrams, each owning one Graph over its own Things (ADR 0040).
 *
 * Two rather than one deliberately: it is what makes the flatten an Algorithmic
 * View draws differ from what either Diagram draws, so both of Navigation's
 * "does not show" refusals name a real state rather than an impossible one.
 */
function fixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fixture',
      diagrams: [
        {
          id: FIRST_DIAGRAM,
          title: 'First graph',
          positions: {
            [THING_A]: { x: 0, y: 0, open: false },
          },
          graphs: [{ id: GRAPH_THREE, title: 'Three', edges: [] }],
        },
        {
          id: DIAGRAM,
          title: 'Second graph',
          positions: {
            [THING_A]: { x: -320, y: 200, open: false },
            [THING_B]: { x: 0, y: 200, open: false },
            [THING_C]: { x: 320, y: 200, open: false },
          },
          graphs: [
            { id: GRAPH_ONE, title: 'One', edges: [{ from: THING_A, to: THING_B }] },
            { id: GRAPH_TWO, title: 'Two', edges: [{ from: THING_B, to: THING_C }] },
          ],
        },
      ],
    },
    [thingFile(THING_A), thingFile(THING_B), thingFile(THING_C)],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

/**
 * One Diagram owning the given Graphs over the given Things, which is the fewest
 * moving parts a Space with any structure at all has under ADR 0040. Every Thing
 * named is a member, so the Diagram's Edges are closed over it by construction.
 */
function spaceOwning(
  title: string,
  graphs: readonly { id: UUID; title: string; edges: readonly { from: UUID; to: UUID }[] }[],
  things: readonly { id: UUID; title?: string }[],
): Space {
  const loaded = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title,
      diagrams: [
        {
          id: DIAGRAM,
          title: 'Only',
          positions: Object.fromEntries(
            things.map((thing, index) => [thing.id, { x: index * 320, y: 0, open: false }]),
          ),
          graphs,
        },
      ],
    },
    things.map((thing) =>
      thing.title === undefined ? thingFile(thing.id) : thingFile(thing.id, thing.title),
    ),
  );
  if (!loaded.ok)
    throw new Error(`${title} should load: ${loaded.errors.map((e) => e.message).join('; ')}`);
  return loaded.space;
}

it('selects a Diagram and its active Graph without changing the Space', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  navigation.present();

  navigation.selectDiagram(DIAGRAM);

  expect(navigation.getState()).toMatchObject({
    selectedDiagramId: DIAGRAM,
    activeGraphId: GRAPH_ONE,
    mode: 'overview',
  });
  expect(navigation.activeThingId()).toBeNull();
  expect(space.defaultDiagram).toBeUndefined();

  navigation.selectDiagram(FIRST_DIAGRAM);
  expect(navigation.getState().selectedDiagramId).toEqual(FIRST_DIAGRAM);
});

it('traverses an Edge from the changing working Space without installing a copy', () => {
  const thingA = uuid('00000000-0000-4000-8000-000000000002');
  const thingB = uuid('00000000-0000-4000-8000-000000000003');
  const thingC = uuid('00000000-0000-4000-8000-000000000004');
  let working = fixture();
  const navigation = navigationFor(() => working, DIAGRAM);
  navigation.present();

  // The same Space with a second Edge out of A, authored into the Graph the
  // first Diagram owns — which means C joins that Diagram's membership too.
  const changed = loadSpace(
    {
      version: 1,
      id: working.id,
      title: working.title,
      diagrams: [
        working.diagrams[0]!,
        {
          id: DIAGRAM,
          title: 'Second graph',
          positions: {
            [thingA]: { x: 0, y: 0, open: false },
            [thingB]: { x: 320, y: 0, open: false },
            [thingC]: { x: 640, y: 0, open: false },
          },
          graphs: [
            {
              id: GRAPH_ONE,
              title: 'One',
              edges: [
                { from: thingA, to: thingB },
                { from: thingA, to: thingC },
              ],
            },
            working.diagrams[1]!.graphs[1]!,
          ],
        },
      ],
    },
    [thingFile(thingA), thingFile(thingB), thingFile(thingC, 'New destination')],
  );
  if (!changed.ok) throw new Error('changed fixture should load');
  working = changed.space;

  expect(navigation.moves()).toEqual([
    { thingId: thingB, title: 'B', selected: true },
    { thingId: thingC, title: 'New destination', selected: false },
  ]);
  navigation.selectBranch(1);
  navigation.advance();
  expect(navigation.activeThingId()).toBe(thingC);
});

/**
 * A self-connection is the first gesture authoring ships, and the Graph it mints
 * is fully cyclic: every Thing it holds is arrived at, so no Thing is an entry.
 * Presenting one used to do nothing at all — `graphStartThing` answered nothing,
 * `present()` returned before any state change, and the enabled control that
 * called it swallowed the click.
 */
it('presents a fully cyclic Graph, which has no entry Thing', () => {
  const thing = uuid('00000000-0000-4000-8000-000000000002');
  const space = spaceOwning(
    'Loop',
    [{ id: GRAPH_ONE, title: 'Loop', edges: [{ from: thing, to: thing }] }],
    [{ id: thing }],
  );
  const navigation = navigationFor(() => space, DIAGRAM);

  navigation.present();

  expect(navigation.getState()).toMatchObject({ mode: 'presenting', traversalHistory: [thing] });
  expect(navigation.moves()).toEqual([{ thingId: thing, title: 'A', selected: true }]);
});

/**
 * A move names the Thing it goes to by that Thing's **name** (ADR 0083).
 *
 * `moves()` is what the presenting chrome draws a row from and what a move's
 * accessible name is composed of, so a Title's later lines reaching it would
 * arrive on screen as a run-together label rather than as an error. The ladder
 * is the Thing front's and does not travel.
 */
it('names a move by the Thing’s name, not by its whole Title', () => {
  const thingA = uuid('00000000-0000-4000-8000-000000000002');
  const thingB = uuid('00000000-0000-4000-8000-000000000003');
  const space = spaceOwning(
    'Presented',
    [{ id: GRAPH_ONE, title: 'One', edges: [{ from: thingA, to: thingB }] }],
    [{ id: thingA }, { id: thingB, title: 'Auth\nHow a session begins' }],
  );
  const navigation = navigationFor(() => space, DIAGRAM);

  navigation.present();

  expect(navigation.moves()).toEqual([{ thingId: thingB, title: 'Auth', selected: true }]);
});

/*
 * Traversal history may contain the same Thing twice. Cycles and self-Edges are legal
 * authored structure (ADR 0032), so a presenter traversing a loop accumulates a
 * history whose Things repeat and whose last Thing can be its first again. The Thing
 * being presented is Traversal history's *last* element, never the first occurrence of
 * it — a read that answered the first Thing in Traversal history would go on offering the
 * moves out of that Thing for the rest of the loop, and the two only diverge once
 * a Thing repeats.
 *
 * The other two shapes are pinned already and not repeated here: a one-Thing Traversal history
 * is read by "opens and closes Things…" straight after `present()`, and Traversal history
 * that has advanced by the fork test below.
 */
it('reads the last Thing when Traversal history returns to one it has already visited', () => {
  const thingA = uuid('00000000-0000-4000-8000-000000000002');
  const thingB = uuid('00000000-0000-4000-8000-000000000003');
  const space = spaceOwning(
    'Cycle',
    [
      {
        id: GRAPH_ONE,
        title: 'Cycle',
        edges: [
          { from: thingA, to: thingB },
          { from: thingB, to: thingA },
        ],
      },
    ],
    [{ id: thingA }, { id: thingB }],
  );
  const navigation = navigationFor(() => space, DIAGRAM);

  navigation.present();
  navigation.advance();
  navigation.advance();

  // Back where it began: Traversal history's last Thing is its first, and presenting
  // stands on it rather than merely carrying it at the front.
  expect(traversalHistoryOf(navigation.getState())).toEqual([thingA, thingB, thingA]);
  expect(navigation.activeThingId()).toBe(thingA);
  expect(navigation.moves()).toEqual([{ thingId: thingB, title: 'B', selected: true }]);

  navigation.advance();

  // The case the two answers separate on: Traversal history repeats a Thing and its last
  // is no longer its first, so reading the start answers A where the presenter
  // is standing on B. The moves are asserted here rather than only above,
  // because above the last Thing *is* the first and both readings agree — this
  // is the only place the Edges offered can tell a correct read from a wrong
  // one, and they are what the presenting chrome puts on screen.
  expect(traversalHistoryOf(navigation.getState())).toEqual([thingA, thingB, thingA, thingB]);
  expect(navigation.activeThingId()).toBe(thingB);
  expect(navigation.moves()).toEqual([{ thingId: thingA, title: 'A', selected: true }]);

  navigation.retreat();
  expect(navigation.activeThingId()).toBe(thingA);
});

/*
 * Traversal history belongs to presenting, and leaving presenting has none to clear. This
 * used to be four hand-written `traversalHistory: []` resets — one per path back to the
 * overview — any of which could have been forgotten without anything noticing
 * until a stale Thing was read from history after presentation had ended.
 */
it('leaves no Traversal history behind when presenting ends', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  navigation.present();
  navigation.advance();

  navigation.exitPresenting();

  expect(navigation.getState()).toEqual({
    selectedDiagramId: DIAGRAM,
    activeGraphId: GRAPH_ONE,
    mode: 'overview',
  });
  expect(navigation.activeThingId()).toBeNull();
});

/*
 * Presenting stands on a Thing for as long as it lasts: it begins on the Graph's
 * start Thing and `retreat` keeps the first, so Traversal history is non-empty by type
 * rather than by a check at each read.
 */
it('stands on a Thing for as long as it is presenting', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);

  navigation.present();

  const state = navigation.getState();
  if (state.mode !== 'presenting')
    throw new Error('present() should have started Traversal history');
  expectTypeOf(state.traversalHistory[0]).toEqualTypeOf<ThingId>();
  expect(state.traversalHistory[0]).toBe(uuid('00000000-0000-4000-8000-000000000002'));
});

it('activating a Graph ends the current Traversal history without changing the Space', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  navigation.present();

  navigation.activateGraph(GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    activeGraphId: GRAPH_TWO,
    mode: 'overview',
  });
  expect(navigation.activeThingId()).toBeNull();
  expect(space.defaultDiagram).toBeUndefined();
});

it('opens a Graph destination in its named Diagram with one navigation publication', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  const observed: NavigationState[] = [];
  navigation.subscribe(() => observed.push(navigation.getState()));

  navigation.openGraph(DIAGRAM, GRAPH_TWO);

  expect(observed).toHaveLength(1);
  expect(navigation.getState()).toEqual({
    selectedDiagramId: DIAGRAM,
    activeGraphId: GRAPH_TWO,
    mode: 'overview',
  });
  expect(space.defaultDiagram).toBeUndefined();
});

it('opens an exact presentation Thing with fresh Traversal history in one publication', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  navigation.present();
  navigation.advance();
  const observed: NavigationState[] = [];
  navigation.subscribe(() => observed.push(navigation.getState()));

  navigation.openPresentation(DIAGRAM, GRAPH_TWO, THING_C);

  expect(observed).toHaveLength(1);
  expect(navigation.getState()).toEqual({
    selectedDiagramId: DIAGRAM,
    activeGraphId: GRAPH_TWO,
    mode: 'presenting',
    traversalHistory: [THING_C],
    branchIndex: 0,
  });
  expect(canRetreat(navigation.getState())).toBe(false);
  expect(space.defaultDiagram).toBeUndefined();
});

it('refuses to activate a Graph the current Space does not hold', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  navigation.present();
  const before = navigation.getState();

  // The same invariant `selectDiagram` holds, for the other half of what
  // Navigation names. Activating is not an edit, so it cannot mint the Graph it
  // is handed; a Graph the Space does not hold would strand every later read —
  // `moves()`, `present()` and the emphasis — on a lookup that answers nothing.
  expect(() => navigation.activateGraph(uuid('00000000-0000-4000-8000-000000000099'))).toThrow(
    /does not exist/,
  );
  expect(navigation.getState()).toBe(before);
});

/*
 * Adopting the Diagram an Edit wrote carries its Active Graph with it, because
 * under ADR 0040 a Diagram and the Graph it opens on are one answer the Edit
 * produced.
 *
 * What the test is for is unchanged, and is the thing `selectDiagram` does not
 * do: adopting the Diagram an Edit created continues the traversal rather than
 * ending it, down to the same Traversal history array.
 */
it('continues the current Traversal history when an Edit keeps the selected Diagram', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  navigation.activateGraph(GRAPH_TWO);
  navigation.present();
  const traversalHistory = traversalHistoryOf(navigation.getState());

  navigation.continueInDiagram(DIAGRAM, GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    selectedDiagramId: DIAGRAM,
    activeGraphId: GRAPH_TWO,
    mode: 'presenting',
  });
  expect(traversalHistoryOf(navigation.getState())).toBe(traversalHistory);
});

/** Adopting a Diagram also adopts the Active Graph that Diagram owns. */
it('takes the adopted Diagram’s own Active Graph over the one that was emphasised', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  expect(navigation.getState().activeGraphId).toBe(GRAPH_ONE);

  navigation.continueInDiagram(DIAGRAM, GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    selectedDiagramId: DIAGRAM,
    activeGraphId: GRAPH_TWO,
  });
});

/**
 * The refusal that ADR 0040 restored. A Diagram draws only the Graphs it owns, so
 * an Edit handing over a Diagram and a Graph that Diagram does not own has named a
 * pair Navigation may not hold — the Active Graph would ride into the next Edit
 * as that Diagram's `activeGraph`, which intake rejects outright.
 *
 * Constructible against a real Space rather than a hand-built Diagram:
 * `GRAPH_ONE` exists and is drawn by the Flow view, and `DIAGRAM` simply does not
 * own it. Edit completion cannot reach it, because the pair it passes is the one
 * it wrote into the snapshot a line earlier.
 */
it('refuses to adopt a Diagram that does not draw the Graph handed with it', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
  navigation.present();
  const before = navigation.getState();

  expect(() => navigation.continueInDiagram(FIRST_DIAGRAM, GRAPH_ONE)).toThrow(
    /does not show the active Graph/,
  );
  expect(navigation.getState()).toBe(before);
});

/**
 * The same refusal from the other side, and the second one ticket 01 left
 * unreachable. Activating is never an Edit (ADR 0028), so it cannot mint the
 * Graph it is handed — nor move it into the selected Diagram. `GraphSelector` is
 * fed the visible Graphs, so this is a caller's mistake rather than an author's.
 */
it('refuses to activate a Graph the selected Diagram does not own', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, FIRST_DIAGRAM);
  const before = navigation.getState();
  expect(before.activeGraphId).toBe(GRAPH_THREE);

  expect(() => navigation.activateGraph(GRAPH_ONE)).toThrow(/does not show the Graph/);
  expect(navigation.getState()).toBe(before);
});

it('notifies subscribers synchronously until they unsubscribe', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, DIAGRAM);
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
  const navigation = navigationFor(() => space, DIAGRAM, space, {
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

it('refuses a Diagram the current Space does not hold, leaving navigation untouched', () => {
  const space = fixture();
  const missing = uuid('00000000-0000-4000-8000-000000000099');
  const navigation = navigationFor(() => space, DIAGRAM);
  navigation.present();
  const before = navigation.getState();

  // Resolving first is the invariant: Navigation may never name a Diagram the
  // Space does not hold, so an unresolvable selection is refused outright rather
  // than half-applied.
  expect(() => navigation.selectDiagram(missing)).toThrow(/does not exist/);
  expect(navigation.getState()).toBe(before);

  expect(() => navigation.continueInDiagram(missing, GRAPH_ONE)).toThrow(/does not exist/);
  expect(navigation.getState()).toBe(before);
});

/*
 * Opening a replacement Space is not navigating to a Diagram within the one
 * already open, and the difference is what each retains. This one retains
 * nothing, because there is no Space left for any of it to belong to.
 */
it('opens a replacement Space as new navigation, retaining no reading state', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, FIRST_DIAGRAM);
  navigation.present();
  navigation.advance();

  navigation.openFresh(DIAGRAM);

  expect(navigation.getState()).toEqual({
    selectedDiagramId: DIAGRAM,
    activeGraphId: GRAPH_ONE,
    mode: 'overview',
  });
});

it('reads the working Space once per moves() call, whatever the branching', () => {
  const thingA = uuid('00000000-0000-4000-8000-000000000002');
  const thingB = uuid('00000000-0000-4000-8000-000000000003');
  const thingC = uuid('00000000-0000-4000-8000-000000000004');
  const forked = spaceOwning(
    'Fork',
    [
      {
        id: GRAPH_ONE,
        title: 'Fork',
        edges: [
          { from: thingA, to: thingB },
          { from: thingA, to: thingC },
        ],
      },
    ],
    [{ id: thingA }, { id: thingB }, { id: thingC }],
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
    DIAGRAM,
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
 * `activeThingId()` answering null after the Space had already been read.
 *
 * The answer alone cannot tell the two apart, so this counts the calls to the
 * thunk instead. `createNavigation` reads the Space to resolve its initial
 * Diagram, and other members read it too, so what is pinned is that this one
 * call adds nothing rather than that the total is zero.
 */
it('answers no moves outside Traversal history without reading the working Space', () => {
  const space = fixture();
  const currentSpace = vi.fn(() => space);
  const navigation = navigationFor(currentSpace, DIAGRAM);

  const before = currentSpace.mock.calls.length;
  const moves = navigation.moves();

  expect(moves).toEqual([]);
  expect(currentSpace).toHaveBeenCalledTimes(before);
});

it('traverses a fork, retreats along Traversal history, and reselects the Edge taken', () => {
  const thingA = uuid('00000000-0000-4000-8000-000000000002');
  const thingB = uuid('00000000-0000-4000-8000-000000000003');
  const thingC = uuid('00000000-0000-4000-8000-000000000004');
  const forked = spaceOwning(
    'Fork',
    [
      {
        id: GRAPH_ONE,
        title: 'Fork',
        edges: [
          { from: thingA, to: thingB },
          { from: thingA, to: thingC },
        ],
      },
    ],
    [{ id: thingA }, { id: thingB }, { id: thingC }],
  );
  const navigation = navigationFor(() => forked, DIAGRAM);
  navigation.present();

  navigation.selectBranch(-1);
  expect(navigation.moves().find((move) => move.selected)?.thingId).toBe(thingC);
  navigation.advance();
  navigation.retreat();

  expect(navigation.activeThingId()).toBe(thingA);
  expect(navigation.moves().find((move) => move.selected)?.thingId).toBe(thingC);
  navigation.advance();
  expect(navigation.activeThingId()).toBe(thingC);
});

/**
 * The addressable position, after every operation that writes one.
 *
 * One assertion shape for all of them, because the point of the address is that
 * it is *one* fact: before it, `App` reconstructed the position four separate
 * ways, each comparing the single field its own call site happened to supply
 * (ADR 0081). Nothing here touches a browser API — Navigation does not know what
 * a URL is, and this is where that stays true.
 */
describe('the address Navigation answers', () => {
  const addressOf = (navigation: Navigation) => navigationAddress(navigation.getState());

  it('answers the Diagram a Space opens in, its Active Graph, and no presented Thing', () => {
    const navigation = navigationFor(fixture, DIAGRAM);

    expect(addressOf(navigation)).toEqual({
      selectedDiagramId: DIAGRAM,
      activeGraphId: GRAPH_ONE,
      presentingThingId: null,
    });
  });

  it('answers the selected Diagram\u2019s own Active Graph after selectDiagram', () => {
    const navigation = navigationFor(fixture, FIRST_DIAGRAM);

    navigation.selectDiagram(DIAGRAM);

    expect(addressOf(navigation)).toEqual({
      selectedDiagramId: DIAGRAM,
      activeGraphId: GRAPH_ONE,
      presentingThingId: null,
    });
  });

  it('answers a replacement Space\u2019s opening position after openFresh', () => {
    const navigation = navigationFor(fixture, DIAGRAM);
    navigation.present();

    navigation.openFresh(FIRST_DIAGRAM);

    expect(addressOf(navigation)).toEqual({
      selectedDiagramId: FIRST_DIAGRAM,
      activeGraphId: GRAPH_THREE,
      presentingThingId: null,
    });
  });

  it('answers the adopted Diagram and the Graph handed with it after continueInDiagram', () => {
    const navigation = navigationFor(fixture, DIAGRAM);
    navigation.present();
    const presented = navigation.activeThingId();

    navigation.continueInDiagram(FIRST_DIAGRAM, GRAPH_THREE);

    // Adopting a Diagram must not interrupt a traversal, so the presented Thing
    // is still part of the address it answers.
    expect(addressOf(navigation)).toEqual({
      selectedDiagramId: FIRST_DIAGRAM,
      activeGraphId: GRAPH_THREE,
      presentingThingId: presented,
    });
  });

  it('answers the addressed Graph in its named Diagram after openGraph', () => {
    const navigation = navigationFor(fixture, FIRST_DIAGRAM);

    navigation.openGraph(DIAGRAM, GRAPH_TWO);

    expect(addressOf(navigation)).toEqual({
      selectedDiagramId: DIAGRAM,
      activeGraphId: GRAPH_TWO,
      presentingThingId: null,
    });
  });

  it('answers the exact Thing an addressed presentation starts at after openPresentation', () => {
    const navigation = navigationFor(fixture, FIRST_DIAGRAM);

    navigation.openPresentation(DIAGRAM, GRAPH_TWO, THING_C);

    expect(addressOf(navigation)).toEqual({
      selectedDiagramId: DIAGRAM,
      activeGraphId: GRAPH_TWO,
      presentingThingId: THING_C,
    });
  });

  it('answers the activated Graph, and no presented Thing, after activateGraph', () => {
    const navigation = navigationFor(fixture, DIAGRAM);
    navigation.present();

    navigation.activateGraph(GRAPH_TWO);

    expect(addressOf(navigation)).toEqual({
      selectedDiagramId: DIAGRAM,
      activeGraphId: GRAPH_TWO,
      presentingThingId: null,
    });
  });

  it('moves the presented Thing through present, advance, retreat and exitPresenting', () => {
    const navigation = navigationFor(fixture, DIAGRAM);

    navigation.present();
    expect(addressOf(navigation).presentingThingId).toBe(THING_A);

    navigation.advance();
    expect(addressOf(navigation).presentingThingId).toBe(THING_B);

    navigation.retreat();
    expect(addressOf(navigation).presentingThingId).toBe(THING_A);

    navigation.exitPresenting();
    expect(addressOf(navigation)).toEqual({
      selectedDiagramId: DIAGRAM,
      activeGraphId: GRAPH_ONE,
      presentingThingId: null,
    });
  });

  /**
   * The address is derived, never stored (ADR 0081): a stored field would have
   * to be maintained at all six publish sites and could disagree with the state
   * it describes. Selecting a branch publishes a state that is not the one
   * before it and addresses the same position, which is the cheapest proof that
   * the address is read off the state rather than written beside it.
   */
  it('does not move while a fork\u2019s branch is being chosen', () => {
    const forked = spaceOwning(
      'Fork',
      [
        {
          id: GRAPH_ONE,
          title: 'Fork',
          edges: [
            { from: THING_A, to: THING_B },
            { from: THING_A, to: THING_C },
          ],
        },
      ],
      [{ id: THING_A }, { id: THING_B }, { id: THING_C }],
    );
    const navigation = navigationFor(() => forked, DIAGRAM);
    navigation.present();
    const before = addressOf(navigation);

    navigation.selectBranch(1);

    expect(addressOf(navigation)).toEqual(before);
  });
});
