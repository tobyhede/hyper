import type { RouteId } from '@project/core';
import type { Navigation, NavigationState } from '../src/navigation';
import type { RendererSelection } from '../src/view';

type AuthoringNavigation = Pick<Navigation, 'getState' | 'continueInRenderer' | 'activateRoute'>;

export interface RendererChoiceFixture {
  readonly current: () => RendererSelection;
  readonly select: (selection: RendererSelection) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function rendererChoice(initial: RendererSelection): RendererChoiceFixture {
  let renderer = initial;
  const listeners = new Set<() => void>();
  return {
    current: () => renderer,
    select: (selection) => {
      renderer = selection;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * A complete Navigation state around the two fields these fixtures control.
 *
 * The rest are real defaults rather than a cast over a partial object: a cast
 * answers `undefined` for every field it omits while the type promises one, so
 * the day Edit completion reads `mode` or `walk` the fixture lies instead of
 * failing.
 */
function navigationState(
  selectedRenderer: RendererSelection,
  activeRouteId: RouteId | null,
): NavigationState {
  return {
    selectedRenderer,
    selectedView: selectedRenderer.kind === 'view' ? selectedRenderer.view : 'graph',
    mode: 'overview',
    activeRouteId,
    walk: [],
    branchIndex: 0,
    openedCardId: null,
  };
}

/** Legacy Edit-completion fixture; Navigation behavior itself is tested at its public seam. */
export function authoringNavigation(
  initialRenderer: RendererSelection,
  currentActiveRoute: () => RouteId | null,
  onActivate: (routeId: RouteId) => void = () => undefined,
): AuthoringNavigation & { readonly selectedRenderer: () => RendererSelection } {
  let renderer = initialRenderer;
  const getState = (): NavigationState => navigationState(renderer, currentActiveRoute());
  return {
    getState,
    continueInRenderer: (selection) => {
      renderer = selection;
    },
    activateRoute: onActivate,
    selectedRenderer: () => renderer,
  };
}

export function navigationFromChoice(
  choice: RendererChoiceFixture,
  currentActiveRoute: () => RouteId | null,
  onActivate: (routeId: RouteId) => void = () => undefined,
): AuthoringNavigation {
  return {
    getState: () => navigationState(choice.current(), currentActiveRoute()),
    continueInRenderer: choice.select,
    activateRoute: onActivate,
  };
}
