import type { CardId, GraphId } from '@project/core';
import { outgoingEdges, graphStartCard, type Space } from '@project/graph';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import type { CanvasRendererId, ResolvedRenderer, ResolveRenderer } from './renderer';

export interface Move {
  readonly cardId: CardId;
  readonly title: string;
  readonly selected: boolean;
}

/**
 * The Cards a presenter has passed through, in order, the last of them the one
 * being presented.
 *
 * Non-empty, and by type rather than by convention: presenting begins on a
 * Graph's start Card and `retreat` keeps the first, so its Traversal history can
 * never be empty. Navigation excludes that state by construction rather than at
 * every read.
 */
type TraversalHistory = readonly [CardId, ...CardId[]];

/** What navigation carries whatever it is doing. */
interface NavigationBase {
  readonly selectedRenderer: CanvasRendererId;
  readonly activeGraphId: GraphId | null;
  readonly openedCardId: CardId | null;
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

/** Navigation through the current working Space, independent of any UI framework. */
export interface Navigation {
  readonly getState: () => NavigationState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly selectRenderer: (selection: CanvasRendererId) => void;
  /** Open a replacement Space as new navigation, retaining no prior reading state. */
  readonly openFresh: (selection: CanvasRendererId) => void;
  /**
   * Adopt a renderer created by an Edit, and the Active Graph that goes with it,
   * without interrupting the current navigation.
   *
   * The two arrive together because under ADR 0040 they are one answer: a Layout
   * owns its Graphs, so the Graph a Layout opens on is a fact about that Layout
   * and not something Navigation carries across from the renderer before it.
   */
  readonly continueInRenderer: (selection: CanvasRendererId, activeGraphId: GraphId | null) => void;
  readonly activateGraph: (graphId: GraphId) => void;
  readonly openCard: (cardId: CardId) => void;
  readonly closeCard: () => void;
  readonly present: () => void;
  readonly exitPresenting: () => void;
  readonly advance: () => void;
  readonly retreat: () => void;
  readonly selectBranch: (delta: number) => void;
  readonly activeCardId: () => CardId | null;
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
  cardId: CardId | null | undefined,
) {
  const owned = graphId !== null ? space.lookup.graph(graphId) : undefined;
  return owned !== undefined && cardId != null ? outgoingEdges(owned.graph, cardId) : [];
}

/**
 * Whether a renderer draws a Graph — its subject's membership test, and the
 * whole of it (ADR 0045).
 *
 * Read off the subject rather than decided a second time. Which Graphs a
 * renderer draws is the renderer's answer, and a Navigation that computed its
 * own would disagree with it the moment the two sets differ again.
 */
const rendererShowsGraph = (renderer: ResolvedRenderer, graphId: GraphId): boolean =>
  renderer.subject.graphs.some((graph) => graph.id === graphId);

/** The Graph a renderer opens on: a Layout's own Active Graph, or a View's default. */
const openingGraphId = (renderer: ResolvedRenderer): GraphId | null =>
  renderer.kind === 'layout'
    ? renderer.resolvedLayout.activeGraph.id
    : (renderer.defaultActiveGraph?.id ?? null);

/**
 * The Card at the end of Traversal history, read in place.
 *
 * `noUncheckedIndexedAccess` widens a computed index to `| undefined` however
 * the tuple is declared, so the last element needs an answer for a case it
 * cannot reach; element 0 is a fixed tuple element and keeps its type, so the
 * Traversal history's guaranteed first Card supplies it. Both reads are indexes and neither
 * copies: this runs on every render through `activeCardId` and `moves`, and
 * destructuring a tail to reach the end allocated a copy of the whole
 * accumulated history each time.
 */
function currentCard(traversalHistory: TraversalHistory): CardId {
  return traversalHistory[traversalHistory.length - 1] ?? traversalHistory[0];
}

/**
 * The fields both modes carry, taken off whichever state is current.
 *
 * Named rather than spread, because spreading a presenting state into an
 * overview one carries Traversal history across at runtime — the very thing the type is
 * here to stop, arriving through the back door as an untyped property.
 */
function baseOf(state: NavigationState): NavigationBase {
  const { selectedRenderer, activeGraphId, openedCardId } = state;
  return { selectedRenderer, activeGraphId, openedCardId };
}

/**
 * Navigation as a Space first opens in it: nothing traversed, nothing read, and
 * the active Graph the resolved renderer answers.
 *
 * The one definition, shared by the initial state and by `openFresh` — a
 * replacement Space is opened, not navigated to, so the two cannot be allowed
 * to disagree about what "opened" means.
 */
function openedState(selection: CanvasRendererId, renderer: ResolvedRenderer): NavigationState {
  return {
    selectedRenderer: selection,
    mode: 'overview',
    activeGraphId: openingGraphId(renderer),
    openedCardId: null,
  };
}

export function createNavigation(
  currentSpace: () => Space,
  resolveRenderer: ResolveRenderer,
  initialRenderer: CanvasRendererId,
  initialSpace: Space = currentSpace(),
  options: NavigationOptions = {},
): Navigation {
  const observable = createObservableState(
    openedState(initialRenderer, resolveRenderer(initialSpace, initialRenderer)),
    options.reportObserverError ?? reportToConsole,
  );
  // Whatever navigation is doing, it goes on doing: a change to the fields both
  // modes share cannot name `mode`, so it can neither start nor end a traversal.
  const setState = (change: Partial<NavigationBase>): void => {
    observable.publish({ ...observable.getState(), ...change });
  };
  const activeCardId = (): CardId | null => {
    const state = observable.getState();
    return state.mode === 'presenting' ? currentCard(state.traversalHistory) : null;
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    selectRenderer: (selection) => {
      const renderer = resolveRenderer(currentSpace(), selection);
      observable.publish({
        ...baseOf(observable.getState()),
        selectedRenderer: selection,
        activeGraphId: openingGraphId(renderer),
        mode: 'overview',
        // An opened Card closes with the renderer it was opened over. This once
        // retained it, because opening was reading and a re-arrangement beneath
        // a Card being read changes nothing about it — but opening is editing
        // now (ADR 0037), and an Algorithmic View installs no placement until
        // its strategy resolves. An Edit completed in that window is refused for
        // having no positions to write, and the pane closed on `Done` either
        // way, so the author could not tell a refusal from a save.
        openedCardId: null,
      });
    },
    // Published whole, not merged over what is there: a replacement Space is
    // opened rather than navigated to, so nothing of the previous one survives
    // it. Merging was equivalent only while `openedState` named every field —
    // once it stopped naming `traversalHistory` it stopped clearing Traversal history, and
    // history from a Space that was gone rode across under a `mode` saying there was none.
    openFresh: (selection) => {
      observable.publish(openedState(selection, resolveRenderer(currentSpace(), selection)));
    },
    // Resolve first so navigation can never name a renderer the current Space
    // does not hold. Unlike explicit selection, adopting the Layout an Edit just
    // created is not navigation and must not interrupt a traversal.
    //
    // **The Active Graph arrives with the renderer rather than surviving it.**
    // Under ADR 0040 a Layout owns its Graphs, so the two are one answer and the
    // Edit is what knows it: converting an Algorithmic View mints a Graph the
    // new Layout owns, while the Graph that was merely emphasised on that view
    // belongs to some other Layout and cannot come across. Carrying the previous
    // Active Graph over and checking it — which is what this did while every
    // renderer drew every Graph — now refuses the ordinary first conversion.
    //
    // The refusal below is `activateGraph`'s, from the other side. What either
    // one protects is the *pair* — the selected renderer and the Active Graph —
    // and there is no third writer of it: `openedState` and `selectRenderer`
    // resolve both together, `activateGraph` writes the Graph against the
    // selected renderer, and this writes both. The state either one keeps out is
    // the same dead Edit: an Active Graph the renderer does not draw rides into
    // `updatePositionedLayout` as the Layout's `activeGraph`, which intake
    // rejects outright.
    //
    // **Re-resolving instead of refusing was the wrong repair.** Falling back to
    // the adopted renderer's own Active Graph moves the emphasis without being
    // asked, and this call is the one that must not interrupt a traversal: the
    // history being presented belongs to the Graph that was active, so silently
    // naming another strands `moves()` on Edges out of Cards nothing is
    // presenting. Refusing leaves the traversal exactly as it was. Taking the
    // Graph as an argument is not that repair — the caller states its answer and
    // is held to it, rather than having one invented for it.
    //
    // Its only caller is Edit completion, which cannot reach the refusal: the
    // pair it passes is the Layout it wrote and that Layout's own `activeGraph`,
    // in a snapshot domain intake accepted a line earlier — and intake is
    // precisely the check that a Layout's named `activeGraph` is a Graph it
    // owns. An absent Active Graph names nothing and is exempt.
    continueInRenderer: (selection, activeGraphId) => {
      const renderer = resolveRenderer(currentSpace(), selection);
      if (activeGraphId !== null && !rendererShowsGraph(renderer, activeGraphId)) {
        throw new Error(`The adopted renderer does not show the active Graph ${activeGraphId}.`);
      }
      setState({
        selectedRenderer: selection,
        activeGraphId,
      });
    },
    // Resolved first, for the same reason a renderer is: Navigation may not name
    // structure the current view does not hold. Activating is never an Edit
    // (ADR 0028), so it cannot mint the Graph it is handed.
    //
    // **The harm is a dead Edit, not a stranded read.** A Graph the resolved
    // view does not draw still answers every lookup, so nothing on screen
    // breaks; the id rides into the next completed Edit instead, where
    // `updatePositionedLayout` writes it as the Layout's `activeGraph` and
    // intake rejects it. That Edit is dead on arrival: a permanent
    // `invalid-snapshot`, neither a conflict nor a retry, reported at the commit
    // rather than at the gesture that caused it. This is the authoritative copy
    // of that reasoning; the tests point at it rather than restating it.
    //
    // **The two refusals are separate again.** They were the same check while
    // every renderer drew every Graph in the Space; under ADR 0040 a Layout
    // draws only the Graphs it *owns*, so a Graph that plainly exists — because
    // a second Layout owns it — is one this renderer does not show. "Does not
    // exist" and "does not show" are different mistakes by the caller and each
    // says which.
    //
    // The visible set is read off the resolved renderer's subject rather than
    // recomputed here: one place answers which Graphs a renderer draws (ADR
    // 0026, ADR 0045), and two would disagree the moment the answers differ.
    //
    // Both refusals throw, and deliberately alike. Neither is reachable through
    // the product — `GraphSelector` is fed the visible Graphs — so each is a
    // caller's mistake rather than an author's, and returning would answer one
    // by moving no emphasis and saying nothing, leaving the stale Active Graph
    // to be written by every Edit after it. Throwing names the wrong call at
    // the call that made it, which is the whole point of moving this refusal
    // off the commit. Nothing is half-applied either way: both checks sit above
    // `publish`, so Navigation is left exactly as `selectRenderer` leaves it.
    //
    // **A minted Graph passes by ordering, not by an exemption.** Edit
    // completion submits, *then* adopts the Layout it wrote, and only then
    // activates — so what this resolves is that Layout rather than the renderer
    // the Edit began in, and the Graph the same snapshot added is one that
    // Layout draws.
    activateGraph: (graphId) => {
      const state = observable.getState();
      const space = currentSpace();
      if (space.lookup.graph(graphId) === undefined) {
        throw new Error(`The Graph ${graphId} does not exist.`);
      }
      if (!rendererShowsGraph(resolveRenderer(space, state.selectedRenderer), graphId)) {
        throw new Error(`The selected renderer does not show the Graph ${graphId}.`);
      }
      observable.publish({
        ...baseOf(state),
        activeGraphId: graphId,
        mode: 'overview',
      });
    },
    openCard: (cardId) => setState({ openedCardId: cardId }),
    closeCard: () => setState({ openedCardId: null }),
    // Two refusals, and **both are reachable**. Each is a state with no Card to
    // begin at, and `GraphSelector` disables its control on exactly the union of
    // them, so the two agree — which is what stops either from being a click the
    // control accepts and silently drops. They used to be one guard, and a fully
    // cyclic Graph fell through the gap between them: the control read `Present`,
    // stayed enabled, and swallowed the click.
    //
    // **No active Graph** is the state a Space with no Layouts is in, since a
    // Layout is what owns Graphs (ADR 0040).
    //
    // The **edge-less Graph** below was once the shape `graphSchema` forbade,
    // and its guard was type ceremony. It is now ordinary: creating a Layout
    // creates its initial Active Graph *empty* in the same Edit (ADR 0040), and
    // the Flow view converts by returning exactly that (ADR 0045), so every
    // Layout a plain Card drag produces sits here until the author draws an
    // Edge. `graphStartCard` has no answer for such a Graph. Presenting has
    // something real to decline.
    //
    // Between them, a Graph that is active *and* holds an Edge can always be
    // presented — cyclic ones included (ADR 0032).
    present: () => {
      const state = observable.getState();
      const owned =
        state.activeGraphId === null ? undefined : currentSpace().lookup.graph(state.activeGraphId);
      if (owned === undefined) return;
      const start = graphStartCard(owned.graph);
      if (start === undefined) return;
      observable.publish({
        ...baseOf(state),
        mode: 'presenting',
        traversalHistory: [start],
        branchIndex: 0,
        openedCardId: null,
      });
    },
    exitPresenting: () =>
      observable.publish({ ...baseOf(observable.getState()), mode: 'overview' }),
    // The guard is the no-outgoing-Edge case — no active Graph, or a Card the
    // Graph leaves by nothing — and not an out-of-range `branchIndex`. Overview
    // no longer reaches it and is no longer one of the cases it answers: the
    // Traversal history and the index are presenting's alone, so the mode is settled by the
    // narrowing a line below rather than by falling through to an empty Edge set.
    // **Don't clamp the index to the Edge count here.** Every write keeps it in
    // range for the Card it was written against: `selectBranch` takes it modulo
    // the count, `retreat` uses a `findIndex` result, and every other write is
    // 0. Reaching a stale index needs the Edge set to shrink during a live traversal,
    // which nothing does — an Edit only ever adds Edges, changing Graph or Card
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
        currentCard(state.traversalHistory),
      )[state.branchIndex];
      if (edge === undefined) return;
      const traversalHistory: TraversalHistory = [...state.traversalHistory, edge.to];
      observable.publish({ ...state, traversalHistory, branchIndex: 0 });
    },
    retreat: () => {
      const state = observable.getState();
      if (state.mode !== 'presenting' || state.traversalHistory.length < 2) return;
      // Dropping the last Card cannot empty Traversal history, and this is where that
      // stops being a fact about the length check above and becomes one about
      // the value: the first Card is carried over as itself, so what comes back
      // is non-empty Traversal history rather than an array that happens not to be. The
      // rest-destructuring `currentCard` dropped stays here deliberately:
      // `slice` makes this O(n) in the history length, but it runs once per
      // user gesture rather than on every render, and the copy is what carries
      // the non-emptiness into the type instead of asserting it away.
      const [first, ...rest] = state.traversalHistory;
      const back: TraversalHistory = [first, ...rest.slice(0, -1)];
      const to = currentCard(state.traversalHistory);
      const taken = outgoingEdgesFrom(
        currentSpace(),
        state.activeGraphId,
        currentCard(back),
      ).findIndex((edge) => edge.to === to);
      observable.publish({ ...state, traversalHistory: back, branchIndex: taken < 0 ? 0 : taken });
    },
    selectBranch: (delta) => {
      const state = observable.getState();
      if (state.mode !== 'presenting') return;
      const count = outgoingEdgesFrom(
        currentSpace(),
        state.activeGraphId,
        currentCard(state.traversalHistory),
      ).length;
      if (count < 2) return;
      observable.publish({
        ...state,
        branchIndex: (((state.branchIndex + delta) % count) + count) % count,
      });
    },
    activeCardId,
    // One read for the whole operation. Reading the Space costs a parse and
    // reindex of the working snapshot, and this runs during every App render —
    // a per-Edge read made a branching Graph pay that cost once per move.
    // Resolving once also keeps every title in the answer read from the same
    // Space as the Edges they name. Outside presentation there is no Traversal
    // history to read: the moves are a presented Card's outgoing Edges, and
    // there is no presented Card.
    moves: () => {
      const state = observable.getState();
      if (state.mode !== 'presenting') return [];
      const space = currentSpace();
      return outgoingEdgesFrom(space, state.activeGraphId, currentCard(state.traversalHistory)).map(
        (edge, index) => ({
          cardId: edge.to,
          title: space.lookup.card(edge.to)?.title ?? edge.to,
          selected: index === state.branchIndex,
        }),
      );
    },
  };
}
