import { titleName, type ResourceId, type GraphId, type MapId } from '@project/core';
import {
  graphResourceIds,
  outgoingEdges,
  graphStartResource,
  type ResolvedMap,
  type Space,
} from '@project/graph';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import { resolveMap } from './map-resolution';

export interface Move {
  readonly resourceId: ResourceId;
  readonly title: string;
  readonly selected: boolean;
}

/**
 * The Resources a presenter has passed through, in order, the last of them the one
 * being presented.
 *
 * Non-empty, and by type rather than by convention: presenting begins on a
 * Graph's start Resource and `retreat` keeps the first, so its Traversal history can
 * never be empty. Navigation excludes that state by construction rather than at
 * every read.
 */
type TraversalHistory = readonly [ResourceId, ...ResourceId[]];

/** What navigation carries whatever it is doing. */
interface NavigationBase {
  readonly selectedMapId: MapId;
  readonly activeGraphId: GraphId | null;
}

/**
 * Navigation is either overviewing the whole Space or presenting one Graph;
 * Traversal history and its selected branch belong to the second state alone.
 *
 * They used to sit beside `mode` on one flat state, which admitted an overview
 * carrying Traversal history and a `branchIndex` naming a branch of nothing. Nothing in the
 * type held the correspondence, so every operation maintained it by hand: four
 * separate `traversalHistory: []` with `branchIndex: 0` resets, and a `mode` check in front
 * of every read of either. Splitting on `mode` makes those states
 * unrepresentable, so the resets have nothing to clear and the reads narrow.
 */
export type NavigationState =
  | (NavigationBase & { readonly mode: 'overview' })
  | (NavigationBase & {
      readonly mode: 'presenting';
      readonly traversalHistory: TraversalHistory;
      readonly branchIndex: number;
    });

/**
 * Where the reader is, as one value: the Map drawing, the Graph emphasised
 * and, while presenting, the Resource being presented.
 *
 * Navigation's own vocabulary and nothing else's (ADR 0081). It is not a URL,
 * does not name one, and carries no addressed Resource — the Resource a browser location
 * may name is read from that location by `app` and never written back here.
 */
export interface NavigationAddress {
  readonly selectedMapId: MapId;
  readonly activeGraphId: GraphId | null;
  readonly presentingResourceId: ResourceId | null;
}

/**
 * The addressable position a navigation state is at.
 *
 * **Derived, and never a field on the state.** A stored address would have to be
 * maintained at all six publish sites and could then disagree with the state it
 * describes; derived, it cannot. The mode is not repeated either: the presented
 * Resource is the last of the Traversal history while presenting and `null` in
 * overview, so `presentingResourceId !== null` *is* "presenting".
 */
export function navigationAddress(state: NavigationState): NavigationAddress {
  return {
    selectedMapId: state.selectedMapId,
    activeGraphId: state.activeGraphId,
    presentingResourceId: presentedResource(state),
  };
}

/**
 * The Resource being presented, or `null` in overview.
 *
 * One definition, because two fields express the same fact about it: `activeResourceId`,
 * which App renders from, and {@link navigationAddress}'s `presentingResourceId`.
 * Written out twice they can drift, and the copy that drifts silently is the
 * address — App lists `activeResourceId` as the render-time dependency standing in
 * for `presentingResourceId`, so a rule added to one and not the other leaves the
 * dependency firing while the address still reports the Resource before it, and the
 * browser sync deciding against a position the application is not at.
 */
function presentedResource(state: NavigationState): ResourceId | null {
  return state.mode === 'presenting' ? currentResource(state.traversalHistory) : null;
}

/**
 * Whether Traversal history holds a Resource to go back to.
 *
 * One rule, because two surfaces ask it: `App` draws the chrome over the real
 * Space and `PresentingChromeFixture` draws it over a story's. Written out twice
 * it can drift, and the copy that drifts is the story's — so the Ladle parity
 * proof would go on asserting a retreat rule production no longer follows, which
 * is the gap ADR 0052 exists to close. Only presenting has a history at all.
 */
export function canRetreat(state: NavigationState): boolean {
  return state.mode === 'presenting' && state.traversalHistory.length > 1;
}

/** Navigation through the current working Space, independent of any UI framework. */
export interface Navigation {
  readonly getState: () => NavigationState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly selectMap: (selection: MapId) => void;
  /** Open a replacement Space as new navigation, retaining no prior reading state. */
  readonly openFresh: (selection: MapId) => void;
  /**
   * Adopt a Map created by an Edit, and the Active Graph that goes with it,
   * without interrupting the current navigation.
   *
   * The two arrive together because under ADR 0040 they are one answer: a Map
   * owns its Graphs, so the Graph a Map opens on is a fact about that Map
   * and not something Navigation carries across from the Map before it.
   */
  readonly continueInMap: (selection: MapId, activeGraphId: GraphId | null) => void;
  /** Open an addressed Graph in one compatible Map without authoring either selection. */
  readonly openGraph: (selection: MapId, graphId: GraphId) => void;
  /** Start an addressed presentation at one exact Resource with fresh Traversal history. */
  readonly openPresentation: (selection: MapId, graphId: GraphId, resourceId: ResourceId) => void;
  readonly activateGraph: (graphId: GraphId) => void;
  readonly present: () => void;
  readonly exitPresenting: () => void;
  readonly advance: () => void;
  readonly retreat: () => void;
  readonly selectBranch: (delta: number) => void;
  readonly activeResourceId: () => ResourceId | null;
  readonly moves: () => readonly Move[];
}

export interface NavigationOptions {
  readonly reportObserverError?: ObserverErrorReporter;
}

const reportToConsole = (error: unknown): void => {
  console.error('Navigation observer failed', error);
};

function outgoingEdgesFrom(
  space: Space,
  graphId: GraphId | null,
  resourceId: ResourceId | null | undefined,
) {
  const owned = graphId !== null ? space.lookup.graph(graphId) : undefined;
  return owned !== undefined && resourceId != null ? outgoingEdges(owned.graph, resourceId) : [];
}

/**
 * Whether a Map draws a Graph — its owned-Graph membership test, and the
 * whole of it (ADR 0045).
 *
 * Read off the Map rather than decided a second time. Which Graphs a Map
 * draws is the Map's own answer, and a Navigation that computed its own
 * would disagree with it the moment the two sets differ again.
 *
 * Exported for the same reason it is not recomputed here: Space Authoring asks
 * it of a snapshot a coordinated recovery replaced, and a second membership test
 * written there would be the disagreement this comment already forbids.
 */
export const mapShowsGraph = (resolved: ResolvedMap, graphId: GraphId): boolean =>
  resolved.map.graphs.some((graph) => graph.id === graphId);

/**
 * The Graph a Map opens on: its own Active Graph.
 *
 * Exported because one other question needs the same answer and must not derive
 * a second one: deciding whether a browser location *already opens* an address
 * means asking what a location naming no Graph would leave active, which is this
 * (ADR 0081, `destination-coordination.ts`).
 */
export const openingGraphId = (resolved: ResolvedMap): GraphId => resolved.activeGraph.id;

/**
 * The Resource at the end of Traversal history, read in place.
 *
 * `noUncheckedIndexedAccess` widens a computed index to `| undefined` however
 * the tuple is declared, so the last element needs an answer for a case it
 * cannot reach; element 0 is a fixed tuple element and keeps its type, so the
 * Traversal history's guaranteed first Resource supplies it. Both reads are indexes and neither
 * copies: this runs on every render through `activeResourceId` and `moves`, and
 * destructuring a tail to reach the end allocated a copy of the whole
 * accumulated history each time.
 */
function currentResource(traversalHistory: TraversalHistory): ResourceId {
  return traversalHistory[traversalHistory.length - 1] ?? traversalHistory[0];
}

/**
 * The fields both modes carry, taken off whichever state is current.
 *
 * Named rather than spread, because spreading a presenting state into an
 * overview one carries Traversal history across at runtime — the very resource the type is
 * here to stop, arriving through the back door as an untyped property.
 */
function baseOf(state: NavigationState): NavigationBase {
  const { selectedMapId, activeGraphId } = state;
  return { selectedMapId, activeGraphId };
}

/**
 * Navigation as a Space first opens in it: nothing traversed, nothing read, and
 * the active Graph the resolved Map answers.
 *
 * The one definition, shared by the initial state and by `openFresh` — a
 * replacement Space is opened, not navigated to, so the two cannot be allowed
 * to disagree about what "opened" means.
 */
function openedState(selection: MapId, resolved: ResolvedMap): NavigationState {
  return {
    selectedMapId: selection,
    mode: 'overview',
    activeGraphId: openingGraphId(resolved),
  };
}

export function createNavigation(
  currentSpace: () => Space,
  initialMapId: MapId,
  initialSpace: Space = currentSpace(),
  options: NavigationOptions = {},
): Navigation {
  const observable = createObservableState(
    openedState(initialMapId, resolveMap(initialSpace, initialMapId)),
    options.reportObserverError ?? reportToConsole,
  );
  // Whatever navigation is doing, it goes on doing: a change to the fields both
  // modes share cannot name `mode`, so it can neither start nor end a traversal.
  const setState = (change: Partial<NavigationBase>): void => {
    observable.publish({ ...observable.getState(), ...change });
  };
  const activeResourceId = (): ResourceId | null => presentedResource(observable.getState());

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    selectMap: (selection) => {
      const resolved = resolveMap(currentSpace(), selection);
      observable.publish({
        ...baseOf(observable.getState()),
        selectedMapId: selection,
        activeGraphId: openingGraphId(resolved),
        mode: 'overview',
      });
    },
    // Published whole, not merged over what is there: a replacement Space is
    // opened rather than navigated to, so nothing of the previous one survives
    // it. Merging was equivalent only while `openedState` named every field —
    // once it stopped naming `traversalHistory` it stopped clearing Traversal history, and
    // history from a Space that was gone rode across under a `mode` saying there was none.
    openFresh: (selection) => {
      observable.publish(openedState(selection, resolveMap(currentSpace(), selection)));
    },
    // Resolve first so navigation can never name a Map the current Space
    // does not hold. Unlike explicit selection, adopting the Map an Edit just
    // created is not navigation and must not interrupt a traversal.
    //
    // **The Active Graph arrives with the Map rather than surviving it.**
    // Under ADR 0040 a Map owns its Graphs, so the two are one answer.
    //
    // The refusal below is `activateGraph`'s, from the other side. What either
    // one protects is the *pair* — the selected Map and the Active Graph —
    // and there is no third writer of it: `openedState` and `selectMap`
    // resolve both together, `activateGraph` writes the Graph against the
    // selected Map, and this writes both. The state either one keeps out is
    // the same dead Edit: an Active Graph the Map does not draw rides into
    // `updatePositionedMap` as the Map's `activeGraph`, which intake
    // rejects outright.
    //
    // **Re-resolving instead of refusing was the wrong repair.** Falling back to
    // the adopted Map's own Active Graph moves the emphasis without being
    // asked, and this call is the one that must not interrupt a traversal: the
    // history being presented belongs to the Graph that was active, so silently
    // naming another strands `moves()` on Edges out of Resources nothing is
    // presenting. Refusing leaves the traversal exactly as it was. Taking the
    // Graph as an argument is not that repair — the caller states its answer and
    // is held to it, rather than having one invented for it.
    //
    // Its only caller is Edit completion, which cannot reach the refusal: the
    // pair it passes is the Map it wrote and that Map's own `activeGraph`,
    // in a snapshot domain intake accepted a line earlier — and intake is
    // precisely the check that a Map's named `activeGraph` is a Graph it
    // owns. An absent Active Graph names nothing and is exempt.
    continueInMap: (selection, activeGraphId) => {
      const resolved = resolveMap(currentSpace(), selection);
      if (activeGraphId !== null && !mapShowsGraph(resolved, activeGraphId)) {
        throw new Error(`The adopted Map does not show the active Graph ${activeGraphId}.`);
      }
      setState({
        selectedMapId: selection,
        activeGraphId,
      });
    },
    openGraph: (selection, graphId) => {
      const space = currentSpace();
      if (space.lookup.graph(graphId) === undefined) {
        throw new Error(`The Graph ${graphId} does not exist.`);
      }
      const resolved = resolveMap(space, selection);
      if (!mapShowsGraph(resolved, graphId)) {
        throw new Error(`The selected Map does not show the Graph ${graphId}.`);
      }
      observable.publish({
        selectedMapId: selection,
        activeGraphId: graphId,
        mode: 'overview',
      });
    },
    openPresentation: (selection, graphId, resourceId) => {
      const space = currentSpace();
      if (space.lookup.graph(graphId) === undefined) {
        throw new Error(`The Graph ${graphId} does not exist.`);
      }
      const resolved = resolveMap(space, selection);
      if (!mapShowsGraph(resolved, graphId)) {
        throw new Error(`The selected Map does not show the Graph ${graphId}.`);
      }
      if (!graphResourceIds(space, graphId).includes(resourceId)) {
        throw new Error(`The Graph ${graphId} does not contain the Resource ${resourceId}.`);
      }
      observable.publish({
        selectedMapId: selection,
        activeGraphId: graphId,
        mode: 'presenting',
        traversalHistory: [resourceId],
        branchIndex: 0,
      });
    },
    // Resolved first, for the same reason a Map is: Navigation may not name
    // structure the current view does not hold. Activating is never an Edit
    // (ADR 0028), so it cannot mint the Graph it is handed.
    //
    // **The harm is a dead Edit, not a stranded read.** A Graph the resolved
    // view does not draw still answers every lookup, so nothing on screen
    // breaks; the id rides into the next completed Edit instead, where
    // `updatePositionedMap` writes it as the Map's `activeGraph` and
    // intake rejects it. That Edit is dead on arrival: a permanent
    // `invalid-snapshot`, neither a conflict nor a retry, reported at the commit
    // rather than at the gesture that caused it. This is the authoritative copy
    // of that reasoning; the tests point at it rather than restating it.
    //
    // **The two refusals are separate again.** They were the same check while
    // every canvas drew every Graph in the Space; under ADR 0040 a Map
    // draws only the Graphs it *owns*, so a Graph that plainly exists — because
    // a second Map owns it — is one this Map does not show. "Does not
    // exist" and "does not show" are different mistakes by the caller and each
    // says which.
    //
    // The visible set is read off the resolved Map's own Graphs rather than
    // recomputed here: one place answers which Graphs a Map draws (ADR 0026,
    // ADR 0045), and two would disagree the moment the answers differ.
    //
    // Both refusals throw, and deliberately alike. Neither is reachable through
    // the product — `GraphSelector` is fed the visible Graphs — so each is a
    // caller's mistake rather than an author's, and returning would answer one
    // by moving no emphasis and saying nothing, leaving the stale Active Graph
    // to be written by every Edit after it. Throwing names the wrong call at
    // the call that made it, which is the whole point of moving this refusal
    // off the commit. Nothing is half-applied either way: both checks sit above
    // `publish`, so Navigation is left exactly as `selectMap` leaves it.
    //
    // **A minted Graph passes by ordering, not by an exemption.** Edit
    // completion submits, *then* adopts the Map it wrote, and only then
    // activates — so what this resolves is that Map rather than the one
    // the Edit began in, and the Graph the same snapshot added is one that
    // Map draws.
    activateGraph: (graphId) => {
      const state = observable.getState();
      const space = currentSpace();
      if (space.lookup.graph(graphId) === undefined) {
        throw new Error(`The Graph ${graphId} does not exist.`);
      }
      if (!mapShowsGraph(resolveMap(space, state.selectedMapId), graphId)) {
        throw new Error(`The selected Map does not show the Graph ${graphId}.`);
      }
      observable.publish({
        ...baseOf(state),
        activeGraphId: graphId,
        mode: 'overview',
      });
    },
    // Two refusals, and **both are reachable**. Each is a state with no Resource to
    // begin at, and `GraphSelector` disables its control on exactly the union of
    // them, so the two agree — which is what stops either from being a click the
    // control accepts and silently drops. They used to be one guard, and a fully
    // cyclic Graph fell through the gap between them: the control read `Present`,
    // stayed enabled, and swallowed the click.
    //
    // **No active Graph** is the state a Space with no Maps is in, since a
    // Map is what owns Graphs (ADR 0040).
    //
    // The **edge-less Graph** below was once the shape `graphSchema` forbade,
    // and its guard was type ceremony. It is now ordinary: creating a Map
    // creates its initial Active Graph *empty* in the same Edit (ADR 0040), and
    // every new Map sits here until the author draws an Edge.
    // `graphStartResource` has no answer for such a Graph. Presenting has something
    // real to decline.
    //
    // Between them, a Graph that is active *and* holds an Edge can always be
    // presented — cyclic ones included (ADR 0032).
    present: () => {
      const state = observable.getState();
      const owned =
        state.activeGraphId === null ? undefined : currentSpace().lookup.graph(state.activeGraphId);
      if (owned === undefined) return;
      const start = graphStartResource(owned.graph);
      if (start === undefined) return;
      observable.publish({
        ...baseOf(state),
        mode: 'presenting',
        traversalHistory: [start],
        branchIndex: 0,
      });
    },
    exitPresenting: () =>
      observable.publish({ ...baseOf(observable.getState()), mode: 'overview' }),
    // The guard is the no-outgoing-Edge case — no active Graph, or a Resource the
    // Graph leaves by nothing — and not an out-of-range `branchIndex`. Overview
    // no longer reaches it and is no longer one of the cases it answers: the
    // Traversal history and the index are presenting's alone, so the mode is settled by the
    // narrowing a line below rather than by falling through to an empty Edge set.
    // **Don't clamp the index to the Edge count here.** Every write keeps it in
    // range for the Resource it was written against: `selectBranch` takes it modulo
    // the count, `retreat` uses a `findIndex` result, and every other write is
    // 0. Reaching a stale index needs the Edge set to shrink during a live traversal,
    // which nothing does — an Edit only ever adds Edges, changing Graph or Resource
    // rewrites the index, structural deletion is not built (ADR 0033), and
    // accepting the stored Space opens fresh navigation, which resets Traversal history
    // and the index with it. Clamping would also be
    // the wrong repair rather than a safe one: `moves()` marks the selection by
    // `index === branchIndex`, so a stale index shows *no* move selected, and
    // advancing to "the last valid Edge" would silently move down one the presenter was
    // never shown. It cannot replace this guard either, since an empty Edge set
    // clamps to `[-1]` and is still `undefined`.
    advance: () => {
      const state = observable.getState();
      if (state.mode !== 'presenting') return;
      const edge = outgoingEdgesFrom(
        currentSpace(),
        state.activeGraphId,
        currentResource(state.traversalHistory),
      )[state.branchIndex];
      if (edge === undefined) return;
      const traversalHistory: TraversalHistory = [...state.traversalHistory, edge.to];
      observable.publish({ ...state, traversalHistory, branchIndex: 0 });
    },
    retreat: () => {
      const state = observable.getState();
      if (state.mode !== 'presenting' || state.traversalHistory.length < 2) return;
      // Dropping the last Resource cannot empty Traversal history, and this is where that
      // stops being a fact about the length check above and becomes one about
      // the value: the first Resource is carried over as itself, so what comes back
      // is non-empty Traversal history rather than an array that happens not to be. The
      // rest-destructuring `currentResource` dropped stays here deliberately:
      // `slice` makes this O(n) in the history length, but it runs once per
      // user gesture rather than on every render, and the copy is what carries
      // the non-emptiness into the type instead of asserting it away.
      const [first, ...rest] = state.traversalHistory;
      const back: TraversalHistory = [first, ...rest.slice(0, -1)];
      const to = currentResource(state.traversalHistory);
      const taken = outgoingEdgesFrom(
        currentSpace(),
        state.activeGraphId,
        currentResource(back),
      ).findIndex((edge) => edge.to === to);
      observable.publish({ ...state, traversalHistory: back, branchIndex: taken < 0 ? 0 : taken });
    },
    selectBranch: (delta) => {
      const state = observable.getState();
      if (state.mode !== 'presenting') return;
      const count = outgoingEdgesFrom(
        currentSpace(),
        state.activeGraphId,
        currentResource(state.traversalHistory),
      ).length;
      if (count < 2) return;
      observable.publish({
        ...state,
        branchIndex: (((state.branchIndex + delta) % count) + count) % count,
      });
    },
    activeResourceId,
    // One read for the whole operation. Reading the Space costs a parse and
    // reindex of the working snapshot, and this runs during every App render —
    // a per-Edge read made a branching Graph pay that cost once per move.
    // Resolving once also keeps every title in the answer read from the same
    // Space as the Edges they name. Outside presentation there is no Traversal
    // history to read: the moves are a presented Resource's outgoing Edges, and
    // there is no presented Resource.
    moves: () => {
      const state = observable.getState();
      if (state.mode !== 'presenting') return [];
      const space = currentSpace();
      return outgoingEdgesFrom(
        space,
        state.activeGraphId,
        currentResource(state.traversalHistory),
      ).map((edge, index) => ({
        resourceId: edge.to,
        // The Resource's name and never its whole Title: a move is a row in
        // the presenting chrome and a control's accessible name, and a
        // newline reaching either draws as a broken-looking label rather
        // than as an error (ADR 0083).
        title: titleName(space.lookup.resource(edge.to)?.title ?? edge.to),
        selected: index === state.branchIndex,
      }));
    },
  };
}
