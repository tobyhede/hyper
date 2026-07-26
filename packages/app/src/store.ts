import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { getCard, getRoute, outgoingEdges, routeStartCard, type Space } from '@project/graph';

export type Mode = 'overview' | 'presenting';

/** One move available from the active card: an outgoing edge, named. */
export interface Move {
  /** The card the edge leads to. */
  cardId: string;
  /** That card's title, for the chrome that lists the choice. */
  title: string;
  selected: boolean;
}

/**
 * What the viewer has selected in the space, and — while presenting — where
 * their walk has got to.
 *
 * Presenting is a **traversal** (ADR 0024): at the active card the presenter
 * follows one of its outgoing edges. It is not an index into a sequence, because
 * a route is a graph. Two pieces of state express it:
 *
 * - `walk` — the cards visited, in the order visited, the last being the active
 *   card. The whole path rather than just the position, because **back reads the
 *   walk, not the graph** (ADR 0027): a card reached by a merge has several
 *   incoming edges and only the path taken says which one was used.
 * - `branchIndex` — which of the active card's outgoing edges is selected.
 *
 * A line is not a special case. One outgoing edge is a one-member selection, so
 * advancing is unambiguous and there is nothing for Up/Down to move through;
 * nothing here tests whether a route is linear (ADR 0024).
 */
export interface SpaceState {
  mode: Mode;
  /**
   * The active route: the one drawn emphasized, and the one an author's edges
   * join (ADR 0021). One concept, not two — the highlight is how active is
   * shown, and carries no separate meaning of its own (ADR 0026).
   */
  activeRouteId: string | null;
  /** The cards walked, in order; the last is the active card. Empty in overview. */
  walk: readonly string[];
  /** Which outgoing edge of the active card is selected. */
  branchIndex: number;
  /**
   * The card the viewer has opened to read, if any. Deliberately not named for a
   * card kind: opening a *space* card to explore its nested graph (ADR 0001) is
   * the same gesture on a different kind, and should reuse this.
   */
  openedCardId: string | null;
  activateRoute: (routeId: string) => void;
  openCard: (cardId: string) => void;
  closeCard: () => void;
  present: () => void;
  exitPresenting: () => void;
  /** Follow the selected edge. */
  advance: () => void;
  /** Undo the last move, re-selecting the edge just walked back over. */
  retreat: () => void;
  /** Move the selection through the active card's outgoing edges. */
  selectBranch: (delta: number) => void;
}

export interface SpaceStore {
  useStore: UseBoundStore<StoreApi<SpaceState>>;
  /** The card the walk has reached, or `null` outside presenting. */
  selectActiveCardId: (state: SpaceState) => string | null;
  /**
   * A card's outgoing edges, with the selected one marked.
   *
   * Takes the three values it depends on rather than the whole state, so it can
   * be memoized on them. As a store selector it would return a fresh array on
   * every render, which Zustand compares by identity — a re-render that produces
   * a new value that causes a re-render, until React gives up.
   */
  movesFrom: (routeId: string | null, cardId: string | null, branchIndex: number) => Move[];
}

/**
 * Build a store bound to a given Space. The Space is passed in rather than
 * imported (ADR 0010), so the store is testable against fixture spaces and never
 * reaches for a module singleton.
 *
 * The route to open active comes in too, resolved from the Layout that named it
 * or from the first route the view shows (ADR 0026). The store does not work it
 * out: which routes are visible is the View's decision, and a store reaching for
 * `space.routes[0]` would answer it a second time and disagree the moment a
 * Layout filters.
 */
export function createSpaceStore(space: Space, initialActiveRouteId: string | null): SpaceStore {
  const routeOf = (routeId: string | null) =>
    routeId !== null ? getRoute(space, routeId) : undefined;

  /** The active card's outgoing edges, or none when the walk is not on one. */
  const edgesFrom = (routeId: string | null, cardId: string | null) => {
    const route = routeOf(routeId);
    if (!route || cardId === null) return [];
    return outgoingEdges(route, cardId);
  };

  /** The same, for a state the store is holding. */
  const edgesFromState = (state: SpaceState) =>
    state.mode === 'presenting'
      ? edgesFrom(state.activeRouteId, state.walk[state.walk.length - 1] ?? null)
      : [];

  const useStore = create<SpaceState>((set, get) => ({
    mode: 'overview',
    activeRouteId: initialActiveRouteId,
    walk: [],
    branchIndex: 0,
    openedCardId: null,

    // Activating a route while presenting would strand the walk on a card the
    // new route may not touch, so it ends the walk. Activating is a deliberate
    // act either way, and never an edit — it converts nothing and leaves the
    // space clean (ADR 0026, ADR 0028).
    activateRoute: (routeId) =>
      set({ activeRouteId: routeId, mode: 'overview', walk: [], branchIndex: 0 }),

    openCard: (cardId) => set({ openedCardId: cardId }),
    closeCard: () => set({ openedCardId: null }),

    present: () => {
      const route = routeOf(get().activeRouteId);
      const start = route ? routeStartCard(route) : undefined;
      // A space with no routes cannot be presented (ADR 0015), and neither can a
      // route with no entry — which acyclicity rules out, so this is a guard
      // against a Route built by hand rather than a case to design for.
      if (start === undefined) return;
      set({ mode: 'presenting', walk: [start], branchIndex: 0, openedCardId: null });
    },

    exitPresenting: () => set({ mode: 'overview', walk: [], branchIndex: 0 }),

    advance: () => {
      const state = get();
      const edge = edgesFromState(state)[state.branchIndex];
      // No outgoing edges: the walk has reached a sink and stays there.
      if (!edge) return;
      set({ walk: [...state.walk, edge.to], branchIndex: 0 });
    },

    retreat: () => {
      const { mode, activeRouteId, walk } = get();
      if (mode !== 'presenting' || walk.length < 2) return;
      const back = walk.slice(0, -1);
      const from = back[back.length - 1];
      const to = walk[walk.length - 1];
      const route = routeOf(activeRouteId);
      // Re-select the edge just walked back over, so going forward again returns
      // where you were rather than to whichever branch happens to be first.
      const taken =
        route && from !== undefined
          ? outgoingEdges(route, from).findIndex((edge) => edge.to === to)
          : -1;
      set({ walk: back, branchIndex: taken < 0 ? 0 : taken });
    },

    selectBranch: (delta) => {
      const state = get();
      const count = edgesFromState(state).length;
      // Nothing to move through at a sink or where the route does not branch.
      if (count < 2) return;
      set({ branchIndex: (((state.branchIndex + delta) % count) + count) % count });
    },
  }));

  const selectActiveCardId = (state: SpaceState): string | null => {
    if (state.mode !== 'presenting') return null;
    return state.walk[state.walk.length - 1] ?? null;
  };

  const movesFrom = (routeId: string | null, cardId: string | null, branchIndex: number): Move[] =>
    edgesFrom(routeId, cardId).map((edge, index) => ({
      cardId: edge.to,
      title: getCard(space, edge.to)?.title ?? edge.to,
      selected: index === branchIndex,
    }));

  return { useStore, selectActiveCardId, movesFrom };
}
