import type { BuiltInViewId, CardId, RouteId } from '@project/core';
import { getCard, getRoute, outgoingEdges, routeStartCard, type Space } from '@project/graph';
import { resolveView, type RendererSelection } from './view';

export type NavigationMode = 'overview' | 'presenting';

export interface Move {
  readonly cardId: CardId;
  readonly title: string;
  readonly selected: boolean;
}

export interface NavigationState {
  readonly selectedRenderer: RendererSelection;
  /** The last Algorithmic View selected, retained while a Layout is selected. */
  readonly selectedView: BuiltInViewId;
  readonly mode: NavigationMode;
  readonly activeRouteId: RouteId | null;
  readonly walk: readonly CardId[];
  readonly branchIndex: number;
  readonly openedCardId: CardId | null;
}

/** Navigation through the current working Space, independent of any UI framework. */
export interface Navigation {
  readonly getState: () => NavigationState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly selectRenderer: (selection: RendererSelection) => void;
  /** Adopt a renderer created by an Edit without interrupting the current navigation. */
  readonly continueInRenderer: (selection: RendererSelection) => void;
  readonly activateRoute: (routeId: RouteId) => void;
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

function outgoingEdgesFrom(
  space: Space,
  routeId: RouteId | null,
  cardId: CardId | null | undefined,
) {
  const route = routeId !== null ? getRoute(space, routeId) : undefined;
  return route !== undefined && cardId != null ? outgoingEdges(route, cardId) : [];
}

export function createNavigation(
  currentSpace: () => Space,
  initialRenderer: RendererSelection,
  initialSpace: Space = currentSpace(),
): Navigation {
  const initialView = resolveView(initialSpace, initialRenderer);
  let state: NavigationState = {
    selectedRenderer: initialRenderer,
    selectedView: initialRenderer.kind === 'view' ? initialRenderer.view : 'graph',
    mode: 'overview',
    activeRouteId: initialView.activeRouteId,
    walk: [],
    branchIndex: 0,
    openedCardId: null,
  };
  const listeners = new Set<() => void>();
  const setState = (change: Partial<NavigationState>): void => {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  };
  const activeCardId = (): CardId | null =>
    state.mode === 'presenting' ? (state.walk[state.walk.length - 1] ?? null) : null;

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    selectRenderer: (selection) => {
      const view = resolveView(currentSpace(), selection);
      setState({
        selectedRenderer: selection,
        ...(selection.kind === 'view' ? { selectedView: selection.view } : {}),
        activeRouteId: view.activeRouteId,
        mode: 'overview',
        walk: [],
        branchIndex: 0,
      });
    },
    continueInRenderer: (selection) => {
      // Resolve first so navigation can never name a renderer the current Space
      // does not hold. Unlike explicit selection, adopting the Layout an Edit
      // just created is not navigation and must not interrupt a walk.
      resolveView(currentSpace(), selection);
      setState({
        selectedRenderer: selection,
        ...(selection.kind === 'view' ? { selectedView: selection.view } : {}),
      });
    },
    activateRoute: (routeId) =>
      setState({ activeRouteId: routeId, mode: 'overview', walk: [], branchIndex: 0 }),
    openCard: (cardId) => setState({ openedCardId: cardId }),
    closeCard: () => setState({ openedCardId: null }),
    present: () => {
      const route =
        state.activeRouteId === null ? undefined : getRoute(currentSpace(), state.activeRouteId);
      const start = route === undefined ? undefined : routeStartCard(route);
      if (start === undefined) return;
      setState({ mode: 'presenting', walk: [start], branchIndex: 0, openedCardId: null });
    },
    exitPresenting: () => setState({ mode: 'overview', walk: [], branchIndex: 0 }),
    advance: () => {
      const edge = outgoingEdgesFrom(currentSpace(), state.activeRouteId, activeCardId())[
        state.branchIndex
      ];
      if (edge === undefined) return;
      setState({ walk: [...state.walk, edge.to], branchIndex: 0 });
    },
    retreat: () => {
      if (state.mode !== 'presenting' || state.walk.length < 2) return;
      const back = state.walk.slice(0, -1);
      const from = back[back.length - 1];
      const to = state.walk[state.walk.length - 1];
      const taken = outgoingEdgesFrom(currentSpace(), state.activeRouteId, from).findIndex(
        (edge) => edge.to === to,
      );
      setState({ walk: back, branchIndex: taken < 0 ? 0 : taken });
    },
    selectBranch: (delta) => {
      const count = outgoingEdgesFrom(currentSpace(), state.activeRouteId, activeCardId()).length;
      if (count < 2) return;
      setState({ branchIndex: (((state.branchIndex + delta) % count) + count) % count });
    },
    activeCardId,
    moves: () =>
      outgoingEdgesFrom(currentSpace(), state.activeRouteId, activeCardId()).map((edge, index) => ({
        cardId: edge.to,
        title: getCard(currentSpace(), edge.to)?.title ?? edge.to,
        selected: index === state.branchIndex,
      })),
  };
}
