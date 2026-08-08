import type { BuiltInViewId, CardId, GraphId } from '@project/core';
import { getCard, getGraph, outgoingEdges, graphStartCard, type Space } from '@project/graph';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import { DEFAULT_VIEW_ID, resolveView, type RendererSelection, type ResolvedView } from './view';

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
 * Graph's start Card and `retreat` keeps the first, so a traversalHistory standing on
 * nothing is a state navigation cannot hold rather than one every read has to
 * exclude.
 */
type TraversalHistory = readonly [CardId, ...CardId[]];

/** What navigation carries whatever it is doing. */
interface NavigationBase {
  readonly selectedRenderer: RendererSelection;
  /** The last Algorithmic View selected, retained while a Layout is selected. */
  readonly selectedView: BuiltInViewId;
  readonly activeGraphId: GraphId | null;
  readonly openedCardId: CardId | null;
}

/**
 * Navigation is either overviewing the whole Space or presenting a traversalHistory through
 * one Graph, and the traversalHistory and its branch belong to the second alone.
 *
 * They used to sit beside `mode` on one flat state, which admitted an overview
 * carrying a traversalHistory and a `branchIndex` naming a branch of nothing. Nothing in the
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
  readonly selectRenderer: (selection: RendererSelection) => void;
  /** Open a replacement Space as new navigation, retaining no prior reading state. */
  readonly openFresh: (selection: RendererSelection) => void;
  /** Adopt a renderer created by an Edit without interrupting the current navigation. */
  readonly continueInRenderer: (selection: RendererSelection) => void;
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
  const graph = graphId !== null ? getGraph(space, graphId) : undefined;
  return graph !== undefined && cardId != null ? outgoingEdges(graph, cardId) : [];
}

/**
 * The Card a traversalHistory stands on: its last, read in place.
 *
 * `noUncheckedIndexedAccess` widens a computed index to `| undefined` however
 * the tuple is declared, so the last element needs an answer for a case it
 * cannot reach; element 0 is a fixed tuple element and keeps its type, so the
 * traversalHistory's own guaranteed Card supplies it. Both reads are indexes and neither
 * copies: this runs on every render through `activeCardId` and `moves`, and
 * destructuring a tail to reach the end allocated a copy of the whole
 * accumulated traversalHistory each time.
 */
function currentCard(traversalHistory: TraversalHistory): CardId {
  return traversalHistory[traversalHistory.length - 1] ?? traversalHistory[0];
}

/**
 * The fields both modes carry, taken off whichever state is current.
 *
 * Named rather than spread, because spreading a presenting state into an
 * overview one carries the traversalHistory across at runtime — the very thing the type is
 * here to stop, arriving through the back door as an untyped property.
 */
function baseOf(state: NavigationState): NavigationBase {
  const { selectedRenderer, selectedView, activeGraphId, openedCardId } = state;
  return { selectedRenderer, selectedView, activeGraphId, openedCardId };
}

/**
 * Navigation as a Space first opens in it: nothing traversed, nothing read, and
 * the active Graph the resolved renderer answers.
 *
 * The one definition, shared by the initial state and by `openFresh` — a
 * replacement Space is opened, not navigated to, so the two cannot be allowed
 * to disagree about what "opened" means. `selectedView` falls back rather than
 * being retained, which is the one thing that separates this from
 * `selectRenderer`: there is no earlier Algorithmic View to return to.
 */
function openedState(selection: RendererSelection, view: ResolvedView): NavigationState {
  return {
    selectedRenderer: selection,
    selectedView: selection.kind === 'view' ? selection.view : DEFAULT_VIEW_ID,
    mode: 'overview',
    activeGraphId: view.activeGraphId,
    openedCardId: null,
  };
}

export function createNavigation(
  currentSpace: () => Space,
  initialRenderer: RendererSelection,
  initialSpace: Space = currentSpace(),
  options: NavigationOptions = {},
): Navigation {
  const observable = createObservableState(
    openedState(initialRenderer, resolveView(initialSpace, initialRenderer)),
    options.reportObserverError ?? reportToConsole,
  );
  // Whatever navigation is doing, it goes on doing: a change to the fields both
  // modes share cannot name `mode`, so it can neither start nor end a traversalHistory.
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
      const view = resolveView(currentSpace(), selection);
      observable.publish({
        ...baseOf(observable.getState()),
        selectedRenderer: selection,
        ...(selection.kind === 'view' ? { selectedView: selection.view } : {}),
        activeGraphId: view.activeGraphId,
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
    // once it stopped naming a traversalHistory it stopped clearing one, and the traversalHistory of a
    // Space that was gone rode across under a `mode` saying there was none.
    openFresh: (selection) => {
      observable.publish(openedState(selection, resolveView(currentSpace(), selection)));
    },
    continueInRenderer: (selection) => {
      // Resolve first so navigation can never name a renderer the current Space
      // does not hold. Unlike explicit selection, adopting the Layout an Edit
      // just created is not navigation and must not interrupt a traversalHistory.
      resolveView(currentSpace(), selection);
      setState({
        selectedRenderer: selection,
        ...(selection.kind === 'view' ? { selectedView: selection.view } : {}),
      });
    },
    // Resolved first, for the same reason a renderer is: Navigation may not name
    // structure the current Space does not hold. Activating is never an Edit
    // (ADR 0028), so it cannot mint the Graph it is handed — an unheld one would
    // strand `moves()`, `present()` and the emphasis on a lookup answering
    // nothing. An Edit that mints the first Graph submits it before activating
    // it, so the Graph is in the working Space by the time this reads.
    activateGraph: (graphId) => {
      if (getGraph(currentSpace(), graphId) === undefined) {
        throw new Error(`The Graph ${graphId} does not exist.`);
      }
      observable.publish({
        ...baseOf(observable.getState()),
        activeGraphId: graphId,
        mode: 'overview',
      });
    },
    openCard: (cardId) => setState({ openedCardId: cardId }),
    closeCard: () => setState({ openedCardId: null }),
    // Two refusals, and only the first is reachable. **No active Graph** is the
    // one the author can produce, and it is exactly what `GraphSelector`
    // disables its control on, so the two now agree: `graphStartCard` answers
    // every schema-valid Graph, cyclic ones included, so a Graph that is active
    // can always be presented. These used to be one guard, and a fully cyclic
    // Graph fell through the gap between them — the control read `Present`,
    // stayed enabled, and swallowed the click.
    //
    // The **edge-less Graph** below is the one `graphSchema` forbids
    // (`edges.min(1)`). Its `undefined` is admitted by the type and not by the
    // domain; the guard is here because the type still needs answering, not
    // because presenting has anything to decline.
    present: () => {
      const state = observable.getState();
      const graph =
        state.activeGraphId === null ? undefined : getGraph(currentSpace(), state.activeGraphId);
      if (graph === undefined) return;
      const start = graphStartCard(graph);
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
    // traversalHistory and the index are presenting's alone, so the mode is settled by the
    // narrowing a line below rather than by falling through to an empty Edge set.
    // **Don't clamp the index to the Edge count here.** Every write keeps it in
    // range for the Card it was written against: `selectBranch` takes it modulo
    // the count, `retreat` uses a `findIndex` result, and every other write is
    // 0. Reaching a stale index needs the Edge set to shrink under a live traversalHistory,
    // which nothing does — an Edit only ever adds Edges, changing Graph or Card
    // rewrites the index, structural deletion is not built (ADR 0033), and
    // accepting the stored Space opens fresh navigation, which resets the traversalHistory
    // and the index with it. Clamping would also be
    // the wrong repair rather than a safe one: `moves()` marks the selection by
    // `index === branchIndex`, so a stale index shows *no* move selected, and
    // advancing to "the last valid Edge" would traversalHistory down one the presenter was
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
      // Dropping the last Card cannot empty the traversalHistory, and this is where that
      // stops being a fact about the length check above and becomes one about
      // the value: the first Card is carried over as itself, so what comes back
      // is a traversalHistory rather than an array that happens not to be empty. The
      // rest-destructuring `currentCard` dropped stays here deliberately:
      // `slice` makes this O(traversalHistory) whatever shape it takes, it runs once per
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
    // Space as the edges they name. Outside a traversalHistory there is nothing to read it
    // for: the moves are a presented Card's outgoing Edges, and there is no
    // presented Card.
    moves: () => {
      const state = observable.getState();
      if (state.mode !== 'presenting') return [];
      const space = currentSpace();
      return outgoingEdgesFrom(space, state.activeGraphId, currentCard(state.traversalHistory)).map(
        (edge, index) => ({
          cardId: edge.to,
          title: getCard(space, edge.to)?.title ?? edge.to,
          selected: index === state.branchIndex,
        }),
      );
    },
  };
}
