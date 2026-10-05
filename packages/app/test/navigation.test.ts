import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { uuidSchema, type ResourceId, type GraphId, type MapId, type UUID } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import {
  canRetreat,
  createNavigation,
  navigationAddress,
  type Navigation,
  type NavigationState,
  type NavigationOptions,
} from '../src/navigation';
import { resourceFile } from './resource-files';

const navigationFor = (
  currentSpace: () => Space,
  initialMapId: MapId,
  initialSpace?: Space,
  options?: NavigationOptions,
) => createNavigation(currentSpace, initialMapId, initialSpace ?? currentSpace(), options ?? {});

const uuid = (value: string): UUID => uuidSchema.parse(value);

/**
 * Traversal history belongs to a presenting state. Reading it requires narrowing, which is the
 * point of the split: a state that is not presenting has no Traversal history to read, here
 * or anywhere else.
 */
function traversalHistoryOf(state: NavigationState): readonly ResourceId[] {
  if (state.mode !== 'presenting') throw new Error('navigation should be presenting');
  return state.traversalHistory;
}

const GRAPH_ONE = uuid('00000000-0000-4000-8000-000000000031');
const GRAPH_TWO = uuid('00000000-0000-4000-8000-000000000032');
const GRAPH_THREE = uuid('00000000-0000-4000-8000-000000000033');
const FIRST_MAP = uuid('00000000-0000-4000-8000-000000000040');
const MAP = uuid('00000000-0000-4000-8000-000000000041');
const RESOURCE_A = uuid('00000000-0000-4000-8000-000000000002');
const RESOURCE_B = uuid('00000000-0000-4000-8000-000000000003');
const RESOURCE_C = uuid('00000000-0000-4000-8000-000000000004');

/**
 * Two Maps, each owning one Graph over its own Resources (ADR 0040).
 *
 * Two rather than one deliberately: it is what makes a flattened union of both
 * differ from what either Map draws, so both of Navigation's "does not
 * show" refusals name a real state rather than an impossible one.
 */
function fixture(): Space {
  const result = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title: 'Fixture',
      maps: [
        {
          id: FIRST_MAP,
          title: 'First graph',
          positions: {
            [RESOURCE_A]: { x: 0, y: 0, open: false },
          },
          graphs: [{ id: GRAPH_THREE, title: 'Three', edges: [] }],
        },
        {
          id: MAP,
          title: 'Second graph',
          positions: {
            [RESOURCE_A]: { x: -320, y: 200, open: false },
            [RESOURCE_B]: { x: 0, y: 200, open: false },
            [RESOURCE_C]: { x: 320, y: 200, open: false },
          },
          graphs: [
            { id: GRAPH_ONE, title: 'One', edges: [{ from: RESOURCE_A, to: RESOURCE_B }] },
            { id: GRAPH_TWO, title: 'Two', edges: [{ from: RESOURCE_B, to: RESOURCE_C }] },
          ],
        },
      ],
    },
    [resourceFile(RESOURCE_A), resourceFile(RESOURCE_B), resourceFile(RESOURCE_C)],
  );
  if (!result.ok) throw new Error('fixture should load');
  return result.space;
}

/**
 * One Map owning the given Graphs over the given Resources, which is the fewest
 * moving parts a Space with any structure at all has under ADR 0040. Every Resource
 * named is a member, so the Map's Edges are closed over it by construction.
 */
function spaceOwning(
  title: string,
  graphs: readonly { id: UUID; title: string; edges: readonly { from: UUID; to: UUID }[] }[],
  resources: readonly { id: UUID; title?: string }[],
): Space {
  const loaded = loadSpace(
    {
      version: 1,
      id: uuid('00000000-0000-4000-8000-000000000001'),
      title,
      maps: [
        {
          id: MAP,
          title: 'Only',
          positions: Object.fromEntries(
            resources.map((resource, index) => [
              resource.id,
              { x: index * 320, y: 0, open: false },
            ]),
          ),
          graphs,
        },
      ],
    },
    resources.map((resource) =>
      resource.title === undefined
        ? resourceFile(resource.id)
        : resourceFile(resource.id, resource.title),
    ),
  );
  if (!loaded.ok)
    throw new Error(`${title} should load: ${loaded.errors.map((e) => e.message).join('; ')}`);
  return loaded.space;
}

it('selects a Map and its active Graph without changing the Space', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  navigation.present();

  navigation.selectMap(MAP);

  expect(navigation.getState()).toMatchObject({
    selectedMapId: MAP,
    activeGraphId: GRAPH_ONE,
    mode: 'overview',
  });
  expect(navigation.activeResourceId()).toBeNull();
  expect(space.defaultMap).toBeUndefined();

  navigation.selectMap(FIRST_MAP);
  expect(navigation.getState().selectedMapId).toEqual(FIRST_MAP);
});

it('traverses an Edge from the changing working Space without installing a copy', () => {
  const resourceA = uuid('00000000-0000-4000-8000-000000000002');
  const resourceB = uuid('00000000-0000-4000-8000-000000000003');
  const resourceC = uuid('00000000-0000-4000-8000-000000000004');
  let working = fixture();
  const navigation = navigationFor(() => working, MAP);
  navigation.present();

  // The same Space with a second Edge out of A, authored into the Graph the
  // first Map owns — which means C joins that Map's membership too.
  const changed = loadSpace(
    {
      version: 1,
      id: working.id,
      title: working.title,
      maps: [
        working.maps[0]!,
        {
          id: MAP,
          title: 'Second graph',
          positions: {
            [resourceA]: { x: 0, y: 0, open: false },
            [resourceB]: { x: 320, y: 0, open: false },
            [resourceC]: { x: 640, y: 0, open: false },
          },
          graphs: [
            {
              id: GRAPH_ONE,
              title: 'One',
              edges: [
                { from: resourceA, to: resourceB },
                { from: resourceA, to: resourceC },
              ],
            },
            working.maps[1]!.graphs[1]!,
          ],
        },
      ],
    },
    [resourceFile(resourceA), resourceFile(resourceB), resourceFile(resourceC, 'New destination')],
  );
  if (!changed.ok) throw new Error('changed fixture should load');
  working = changed.space;

  expect(navigation.moves()).toEqual([
    { resourceId: resourceB, title: 'B', selected: true },
    { resourceId: resourceC, title: 'New destination', selected: false },
  ]);
  navigation.selectBranch(1);
  navigation.advance();
  expect(navigation.activeResourceId()).toBe(resourceC);
});

/**
 * A self-connection is the first gesture authoring ships, and the Graph it mints
 * is fully cyclic: every Resource it holds is arrived at, so no Resource is an entry.
 * Presenting one must still start somewhere: if `graphStartResource` answered
 * nothing, `present()` would return before any state change and the enabled
 * control that called it would swallow the click.
 */
it('presents a fully cyclic Graph, which has no entry Resource', () => {
  const resource = uuid('00000000-0000-4000-8000-000000000002');
  const space = spaceOwning(
    'Loop',
    [{ id: GRAPH_ONE, title: 'Loop', edges: [{ from: resource, to: resource }] }],
    [{ id: resource }],
  );
  const navigation = navigationFor(() => space, MAP);

  navigation.present();

  expect(navigation.getState()).toMatchObject({ mode: 'presenting', traversalHistory: [resource] });
  expect(navigation.moves()).toEqual([{ resourceId: resource, title: 'A', selected: true }]);
});

/**
 * A move names the Resource it goes to by that Resource's **name** (ADR 0083).
 *
 * `moves()` is what the presenting chrome draws a row from and what a move's
 * accessible name is composed of, so a Title's later lines reaching it would
 * arrive on screen as a run-together label rather than as an error. The ladder
 * is the Resource front's and does not travel.
 */
it('names a move by the Resource’s name, not by its whole Title', () => {
  const resourceA = uuid('00000000-0000-4000-8000-000000000002');
  const resourceB = uuid('00000000-0000-4000-8000-000000000003');
  const space = spaceOwning(
    'Presented',
    [{ id: GRAPH_ONE, title: 'One', edges: [{ from: resourceA, to: resourceB }] }],
    [{ id: resourceA }, { id: resourceB, title: 'Auth\nHow a session begins' }],
  );
  const navigation = navigationFor(() => space, MAP);

  navigation.present();

  expect(navigation.moves()).toEqual([{ resourceId: resourceB, title: 'Auth', selected: true }]);
});

/*
 * Traversal history may contain the same Resource twice. Cycles and self-Edges are legal
 * authored structure (ADR 0032), so a presenter traversing a loop accumulates a
 * history whose Resources repeat and whose last Resource can be its first again. The Resource
 * being presented is Traversal history's *last* element, never the first occurrence of
 * it — a read that answered the first Resource in Traversal history would go on offering the
 * moves out of that Resource for the rest of the loop, and the two only diverge once
 * a Resource repeats.
 *
 * The other two shapes are pinned already and not repeated here: a one-Resource Traversal history
 * is read by "opens and closes Resources…" straight after `present()`, and Traversal history
 * that has advanced by the fork test below.
 */
it('reads the last Resource when Traversal history returns to one it has already visited', () => {
  const resourceA = uuid('00000000-0000-4000-8000-000000000002');
  const resourceB = uuid('00000000-0000-4000-8000-000000000003');
  const space = spaceOwning(
    'Cycle',
    [
      {
        id: GRAPH_ONE,
        title: 'Cycle',
        edges: [
          { from: resourceA, to: resourceB },
          { from: resourceB, to: resourceA },
        ],
      },
    ],
    [{ id: resourceA }, { id: resourceB }],
  );
  const navigation = navigationFor(() => space, MAP);

  navigation.present();
  navigation.advance();
  navigation.advance();

  // Back where it began: Traversal history's last Resource is its first, and presenting
  // stands on it rather than merely carrying it at the front.
  expect(traversalHistoryOf(navigation.getState())).toEqual([resourceA, resourceB, resourceA]);
  expect(navigation.activeResourceId()).toBe(resourceA);
  expect(navigation.moves()).toEqual([{ resourceId: resourceB, title: 'B', selected: true }]);

  navigation.advance();

  // The case the two answers separate on: Traversal history repeats a Resource and its last
  // is no longer its first, so reading the start answers A where the presenter
  // is standing on B. The moves are asserted here rather than only above,
  // because above the last Resource *is* the first and both readings agree — this
  // is the only place the Edges offered can tell a correct read from a wrong
  // one, and they are what the presenting chrome puts on screen.
  expect(traversalHistoryOf(navigation.getState())).toEqual([
    resourceA,
    resourceB,
    resourceA,
    resourceB,
  ]);
  expect(navigation.activeResourceId()).toBe(resourceB);
  expect(navigation.moves()).toEqual([{ resourceId: resourceA, title: 'A', selected: true }]);

  navigation.retreat();
  expect(navigation.activeResourceId()).toBe(resourceA);
});

/*
 * Traversal history belongs to presenting, and leaving presenting has none to clear,
 * whichever path leads back to the overview — so no path can forget a reset and leave
 * a stale Resource to be read from history after presentation has ended.
 */
it('leaves no Traversal history behind when presenting ends', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  navigation.present();
  navigation.advance();

  navigation.exitPresenting();

  expect(navigation.getState()).toEqual({
    selectedMapId: MAP,
    activeGraphId: GRAPH_ONE,
    mode: 'overview',
  });
  expect(navigation.activeResourceId()).toBeNull();
});

/*
 * Presenting stands on a Resource for as long as it lasts: it begins on the Graph's
 * start Resource and `retreat` keeps the first, so Traversal history is non-empty by type
 * rather than by a check at each read.
 */
it('stands on a Resource for as long as it is presenting', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);

  navigation.present();

  const state = navigation.getState();
  if (state.mode !== 'presenting')
    throw new Error('present() should have started Traversal history');
  expectTypeOf(state.traversalHistory[0]).toEqualTypeOf<ResourceId>();
  expect(state.traversalHistory[0]).toBe(uuid('00000000-0000-4000-8000-000000000002'));
});

it('activating a Graph ends the current Traversal history without changing the Space', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  navigation.present();

  navigation.activateGraph(GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    activeGraphId: GRAPH_TWO,
    mode: 'overview',
  });
  expect(navigation.activeResourceId()).toBeNull();
  expect(space.defaultMap).toBeUndefined();
});

it('opens a Graph destination in its named Map with one navigation publication', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  const observed: NavigationState[] = [];
  navigation.subscribe(() => observed.push(navigation.getState()));

  navigation.openGraph(MAP, GRAPH_TWO);

  expect(observed).toHaveLength(1);
  expect(navigation.getState()).toEqual({
    selectedMapId: MAP,
    activeGraphId: GRAPH_TWO,
    mode: 'overview',
  });
  expect(space.defaultMap).toBeUndefined();
});

it('opens an exact presentation Resource with fresh Traversal history in one publication', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  navigation.present();
  navigation.advance();
  const observed: NavigationState[] = [];
  navigation.subscribe(() => observed.push(navigation.getState()));

  navigation.openPresentation(MAP, GRAPH_TWO, RESOURCE_C);

  expect(observed).toHaveLength(1);
  expect(navigation.getState()).toEqual({
    selectedMapId: MAP,
    activeGraphId: GRAPH_TWO,
    mode: 'presenting',
    traversalHistory: [RESOURCE_C],
    branchIndex: 0,
  });
  expect(canRetreat(navigation.getState())).toBe(false);
  expect(space.defaultMap).toBeUndefined();
});

it('refuses to activate a Graph the current Space does not hold', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  navigation.present();
  const before = navigation.getState();

  // The same invariant `selectMap` holds, for the other half of what
  // Navigation names. Activating is not an edit, so it cannot mint the Graph it
  // is handed; a Graph the Space does not hold would strand every later read —
  // `moves()`, `present()` and the emphasis — on a lookup that answers nothing.
  expect(() => navigation.activateGraph(uuid('00000000-0000-4000-8000-000000000099'))).toThrow(
    /does not exist/,
  );
  expect(navigation.getState()).toBe(before);
});

/*
 * Adopting the Map an Edit wrote carries its Active Graph with it, because
 * under ADR 0040 a Map and the Graph it opens on are one answer the Edit
 * produced.
 *
 * What the test is for is what `selectMap` does not do: adopting the Map an
 * Edit created continues the traversal rather than ending it, down to the same
 * Traversal history array.
 */
it('continues the current Traversal history when an Edit keeps the selected Map', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  navigation.activateGraph(GRAPH_TWO);
  navigation.present();
  const traversalHistory = traversalHistoryOf(navigation.getState());

  navigation.continueInMap(MAP, GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    selectedMapId: MAP,
    activeGraphId: GRAPH_TWO,
    mode: 'presenting',
  });
  expect(traversalHistoryOf(navigation.getState())).toBe(traversalHistory);
});

/** Adopting a Map also adopts the Active Graph that Map owns. */
it('takes the adopted Map’s own Active Graph over the one that was emphasised', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  expect(navigation.getState().activeGraphId).toBe(GRAPH_ONE);

  navigation.continueInMap(MAP, GRAPH_TWO);

  expect(navigation.getState()).toMatchObject({
    selectedMapId: MAP,
    activeGraphId: GRAPH_TWO,
  });
});

/**
 * A Map draws only the Graphs it owns, so an Edit handing over a Map and a
 * Graph that Map does not own has named a pair Navigation may not hold — the
 * Active Graph would ride into the next Edit as that Map's `activeGraph`, which
 * intake rejects outright.
 *
 * Constructible against a real Space rather than a hand-built Map:
 * `GRAPH_ONE` exists and is owned by `MAP`, and `FIRST_MAP` simply does not
 * own it. Edit completion cannot reach it, because the pair it passes is the one
 * it wrote into the snapshot a line earlier.
 */
it('refuses to adopt a Map that does not draw the Graph handed with it', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
  navigation.present();
  const before = navigation.getState();

  expect(() => navigation.continueInMap(FIRST_MAP, GRAPH_ONE)).toThrow(
    /does not show the active Graph/,
  );
  expect(navigation.getState()).toBe(before);
});

/**
 * The same refusal from the other side. Activating is never an Edit (ADR 0028),
 * so it cannot mint the Graph it is handed — nor move it into the selected Map.
 * The Dock's Graph list is fed the selected Map's Graphs, so this is a caller's mistake
 * rather than an author's.
 */
it('refuses to activate a Graph the selected Map does not own', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, FIRST_MAP);
  const before = navigation.getState();
  expect(before.activeGraphId).toBe(GRAPH_THREE);

  expect(() => navigation.activateGraph(GRAPH_ONE)).toThrow(/does not show the Graph/);
  expect(navigation.getState()).toBe(before);
});

it('notifies subscribers synchronously until they unsubscribe', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, MAP);
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
  const navigation = navigationFor(() => space, MAP, space, {
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

it('refuses a Map the current Space does not hold, leaving navigation untouched', () => {
  const space = fixture();
  const missing = uuid('00000000-0000-4000-8000-000000000099');
  const navigation = navigationFor(() => space, MAP);
  navigation.present();
  const before = navigation.getState();

  // Resolving first is the invariant: Navigation may never name a Map the
  // Space does not hold, so an unresolvable selection is refused outright rather
  // than half-applied.
  expect(() => navigation.selectMap(missing)).toThrow(/does not exist/);
  expect(navigation.getState()).toBe(before);

  expect(() => navigation.continueInMap(missing, GRAPH_ONE)).toThrow(/does not exist/);
  expect(navigation.getState()).toBe(before);
});

/*
 * Opening a replacement Space is not navigating to a Map within the one
 * already open, and the difference is what each retains. This one retains
 * nothing, because there is no Space left for any of it to belong to.
 */
it('opens a replacement Space as new navigation, retaining no reading state', () => {
  const space = fixture();
  const navigation = navigationFor(() => space, FIRST_MAP);
  navigation.present();
  navigation.advance();

  navigation.openFresh(MAP);

  expect(navigation.getState()).toEqual({
    selectedMapId: MAP,
    activeGraphId: GRAPH_ONE,
    mode: 'overview',
  });
});

it('reads the working Space once per moves() call, whatever the branching', () => {
  const resourceA = uuid('00000000-0000-4000-8000-000000000002');
  const resourceB = uuid('00000000-0000-4000-8000-000000000003');
  const resourceC = uuid('00000000-0000-4000-8000-000000000004');
  const forked = spaceOwning(
    'Fork',
    [
      {
        id: GRAPH_ONE,
        title: 'Fork',
        edges: [
          { from: resourceA, to: resourceB },
          { from: resourceA, to: resourceC },
        ],
      },
    ],
    [{ id: resourceA }, { id: resourceB }, { id: resourceC }],
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
    MAP,
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
 * `activeResourceId()` answering null after the Space had already been read.
 *
 * The answer alone cannot tell the two apart, so this counts the calls to the
 * thunk instead. `createNavigation` reads the Space to resolve its initial
 * Map, and other members read it too, so what is pinned is that this one
 * call adds nothing rather than that the total is zero.
 */
it('answers no moves outside Traversal history without reading the working Space', () => {
  const space = fixture();
  const currentSpace = vi.fn(() => space);
  const navigation = navigationFor(currentSpace, MAP);

  const before = currentSpace.mock.calls.length;
  const moves = navigation.moves();

  expect(moves).toEqual([]);
  expect(currentSpace).toHaveBeenCalledTimes(before);
});

it('traverses a fork, retreats along Traversal history, and reselects the Edge taken', () => {
  const resourceA = uuid('00000000-0000-4000-8000-000000000002');
  const resourceB = uuid('00000000-0000-4000-8000-000000000003');
  const resourceC = uuid('00000000-0000-4000-8000-000000000004');
  const forked = spaceOwning(
    'Fork',
    [
      {
        id: GRAPH_ONE,
        title: 'Fork',
        edges: [
          { from: resourceA, to: resourceB },
          { from: resourceA, to: resourceC },
        ],
      },
    ],
    [{ id: resourceA }, { id: resourceB }, { id: resourceC }],
  );
  const navigation = navigationFor(() => forked, MAP);
  navigation.present();

  navigation.selectBranch(-1);
  expect(navigation.moves().find((move) => move.selected)?.resourceId).toBe(resourceC);
  navigation.advance();
  navigation.retreat();

  expect(navigation.activeResourceId()).toBe(resourceA);
  expect(navigation.moves().find((move) => move.selected)?.resourceId).toBe(resourceC);
  navigation.advance();
  expect(navigation.activeResourceId()).toBe(resourceC);
});

/**
 * The addressable position, after every operation that writes one.
 *
 * One assertion shape for all of them, because the point of the address is that
 * it is *one* fact, not a position each call site reconstructs from the single
 * field it happens to supply (ADR 0081). Nothing here touches a browser API —
 * Navigation does not know what a URL is, and this is where that stays true.
 */
describe('the address Navigation answers', () => {
  const addressOf = (navigation: Navigation) => navigationAddress(navigation.getState());

  it('answers the Map a Space opens in, its Active Graph, and no presented Resource', () => {
    const navigation = navigationFor(fixture, MAP);

    expect(addressOf(navigation)).toEqual({
      selectedMapId: MAP,
      activeGraphId: GRAPH_ONE,
      presentingResourceId: null,
    });
  });

  it('answers the selected Map\u2019s own Active Graph after selectMap', () => {
    const navigation = navigationFor(fixture, FIRST_MAP);

    navigation.selectMap(MAP);

    expect(addressOf(navigation)).toEqual({
      selectedMapId: MAP,
      activeGraphId: GRAPH_ONE,
      presentingResourceId: null,
    });
  });

  it('answers a replacement Space\u2019s opening position after openFresh', () => {
    const navigation = navigationFor(fixture, MAP);
    navigation.present();

    navigation.openFresh(FIRST_MAP);

    expect(addressOf(navigation)).toEqual({
      selectedMapId: FIRST_MAP,
      activeGraphId: GRAPH_THREE,
      presentingResourceId: null,
    });
  });

  it('answers the adopted Map and the Graph handed with it after continueInMap', () => {
    const navigation = navigationFor(fixture, MAP);
    navigation.present();
    const presented = navigation.activeResourceId();

    navigation.continueInMap(FIRST_MAP, GRAPH_THREE);

    // Adopting a Map must not interrupt a traversal, so the presented Resource
    // is still part of the address it answers.
    expect(addressOf(navigation)).toEqual({
      selectedMapId: FIRST_MAP,
      activeGraphId: GRAPH_THREE,
      presentingResourceId: presented,
    });
  });

  it('answers the addressed Graph in its named Map after openGraph', () => {
    const navigation = navigationFor(fixture, FIRST_MAP);

    navigation.openGraph(MAP, GRAPH_TWO);

    expect(addressOf(navigation)).toEqual({
      selectedMapId: MAP,
      activeGraphId: GRAPH_TWO,
      presentingResourceId: null,
    });
  });

  it('answers the exact Resource an addressed presentation starts at after openPresentation', () => {
    const navigation = navigationFor(fixture, FIRST_MAP);

    navigation.openPresentation(MAP, GRAPH_TWO, RESOURCE_C);

    expect(addressOf(navigation)).toEqual({
      selectedMapId: MAP,
      activeGraphId: GRAPH_TWO,
      presentingResourceId: RESOURCE_C,
    });
  });

  it('answers the activated Graph, and no presented Resource, after activateGraph', () => {
    const navigation = navigationFor(fixture, MAP);
    navigation.present();

    navigation.activateGraph(GRAPH_TWO);

    expect(addressOf(navigation)).toEqual({
      selectedMapId: MAP,
      activeGraphId: GRAPH_TWO,
      presentingResourceId: null,
    });
  });

  it('moves the presented Resource through present, advance, retreat and exitPresenting', () => {
    const navigation = navigationFor(fixture, MAP);

    navigation.present();
    expect(addressOf(navigation).presentingResourceId).toBe(RESOURCE_A);

    navigation.advance();
    expect(addressOf(navigation).presentingResourceId).toBe(RESOURCE_B);

    navigation.retreat();
    expect(addressOf(navigation).presentingResourceId).toBe(RESOURCE_A);

    navigation.exitPresenting();
    expect(addressOf(navigation)).toEqual({
      selectedMapId: MAP,
      activeGraphId: GRAPH_ONE,
      presentingResourceId: null,
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
            { from: RESOURCE_A, to: RESOURCE_B },
            { from: RESOURCE_A, to: RESOURCE_C },
          ],
        },
      ],
      [{ id: RESOURCE_A }, { id: RESOURCE_B }, { id: RESOURCE_C }],
    );
    const navigation = navigationFor(() => forked, MAP);
    navigation.present();
    const before = addressOf(navigation);

    navigation.selectBranch(1);

    expect(addressOf(navigation)).toEqual(before);
  });
});
