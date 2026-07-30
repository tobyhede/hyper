import {
  isBuiltInViewId,
  uuidSchema,
  type BuiltInViewId,
  type CardId,
  type Layout,
  type RouteId,
  type UUID,
} from '@project/core';
import {
  getLayout,
  gridStrategy,
  positionedStrategy,
  type LayoutPoint,
  type LayoutStrategy,
  type Space,
} from '@project/graph';
import { elkStrategy } from '@project/react-flow-adapter';

/**
 * Which view a space opens in, and what that means for arranging and editing.
 *
 * The chain is `space.defaultView` → viewer default → the route-driven graph.
 * The middle link has no surface yet: a viewer-level preference is named in the
 * spec and deliberately not built, so today the chain is two links long.
 *
 * A view also answers which routes it shows and which of them opens active
 * (ADR 0026). Both are read off the resolved Layout, and both have a fallback,
 * so the answer exists for every space — including one with no Layout and one
 * with no routes at all.
 *
 * This lives in `app` rather than `graph` because resolving a view means
 * choosing a strategy, and `elkStrategy` lives in the adapter — `graph` may not
 * reach for it. Composition is exactly this file's job.
 */

/** Where a space opens when it names no view of its own. */
const DEFAULT_VIEW_ID: BuiltInViewId = 'graph';

const BUILT_IN_STRATEGIES: Record<BuiltInViewId, () => LayoutStrategy> = {
  graph: elkStrategy,
  grid: gridStrategy,
};

export interface ResolvedView {
  /** A declared Layout's id, or a built-in view's. */
  id: string;
  /** Arranges the cards this renderer shows. */
  strategy: LayoutStrategy;
  /**
   * The Layout this view already has, or `null` for an automatic view. It is not
   * a permission: every view is editable, and an automatic one gets a Layout by
   * being edited (ADR 0025). What this answers is whether Edit completion
   * updates a Layout the author named or creates one, which is the only thing
   * that reads it.
   */
  layout: Layout | null;
  /**
   * The routes this view draws — a Layout's filter, or every route (ADR 0026).
   * Authored view scope, decided once by whoever wrote the Layout, and never
   * touched by activating a route. Which routes a view shows is the View's call
   * (ADR 0005), and this is the View making it.
   */
  visibleRouteIds: readonly RouteId[];
  /**
   * Which visible route opens active, or `null` in a space with no routes
   * (ADR 0015). The fallback to the first visible route lives here rather than
   * in the store, so there is one place that answers it (ADR 0026).
   */
  activeRouteId: RouteId | null;
}

/** The one renderer currently navigating a Space (ADR 0031). */
export type RendererSelection =
  | { readonly kind: 'view'; readonly view: BuiltInViewId }
  | { readonly kind: 'layout'; readonly layoutId: UUID };

/** Synchronous navigation state for the renderer currently selected by the viewer. */
export interface ViewChoice {
  readonly current: () => RendererSelection;
  readonly select: (selection: RendererSelection) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createViewChoice(initial: RendererSelection): ViewChoice {
  let selected = initial;
  const listeners = new Set<() => void>();
  return {
    current: () => selected,
    select: (selection) => {
      selected = selection;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Which routes a Layout shows and which of them opens active.
 *
 * A read, never a write: an author's space needs neither field, and the answers
 * are computed rather than filled in. What the app *saves* names the active
 * route outright, which is a different rule and lives in `persist.ts` (ADR 0028).
 */
function resolveRoutes(
  space: Space,
  layout: Layout | null,
): Pick<ResolvedView, 'visibleRouteIds' | 'activeRouteId'> {
  const all = space.routes.map((route) => route.id);
  const visibleRouteIds = layout?.routes ?? all;
  return {
    visibleRouteIds,
    // `loadSpace` has already checked that a named `activeRoute` is one of these,
    // so the `??` is the absent case and not a repair of a bad reference.
    activeRouteId: layout?.activeRoute ?? visibleRouteIds[0] ?? null,
  };
}

export function layoutPositionMap(layout: Layout): ReadonlyMap<CardId, LayoutPoint> {
  const positions = new Map<CardId, LayoutPoint>();
  for (const [cardId, point] of Object.entries(layout.positions)) {
    if (point !== undefined) positions.set(uuidSchema.parse(cardId), point);
  }
  return positions;
}

/** Resolve the Space default into the initial renderer selection. */
export function defaultRenderer(space: Space): RendererSelection {
  const requested = space.defaultView ?? DEFAULT_VIEW_ID;
  return isBuiltInViewId(requested)
    ? { kind: 'view', view: requested }
    : { kind: 'layout', layoutId: requested };
}

export function resolveView(
  space: Space,
  selection: RendererSelection = defaultRenderer(space),
): ResolvedView {
  if (selection.kind === 'layout') {
    const layout = getLayout(space, selection.layoutId);
    if (layout === undefined) {
      throw new Error(`The selected Layout ${selection.layoutId} does not exist.`);
    }
    return {
      id: layout.id,
      strategy: positionedStrategy(layoutPositionMap(layout)),
      layout,
      ...resolveRoutes(space, layout),
    };
  }

  const strategy = BUILT_IN_STRATEGIES[selection.view]();
  // A built-in view carries no Layout and so filters nothing: every route shows,
  // and the first is active.
  return {
    id: selection.view,
    strategy,
    layout: null,
    ...resolveRoutes(space, null),
  };
}
