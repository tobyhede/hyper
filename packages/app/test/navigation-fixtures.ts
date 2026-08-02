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

/** Legacy Edit-completion fixture; Navigation behavior itself is tested at its public seam. */
export function authoringNavigation(
  initialRenderer: RendererSelection,
  currentActiveRoute: () => RouteId | null,
  onActivate: (routeId: RouteId) => void = () => undefined,
): AuthoringNavigation & { readonly selectedRenderer: () => RendererSelection } {
  let renderer = initialRenderer;
  const getState = (): NavigationState =>
    ({ selectedRenderer: renderer, activeRouteId: currentActiveRoute() }) as NavigationState;
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
    getState: () =>
      ({
        selectedRenderer: choice.current(),
        activeRouteId: currentActiveRoute(),
      }) as NavigationState,
    continueInRenderer: choice.select,
    activateRoute: onActivate,
  };
}
