import { isBuiltInViewId, type BuiltInViewId, type Layout } from '@project/core';
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
  /** Arranges the cards this view shows. */
  strategy: LayoutStrategy;
  /**
   * The automatic strategy Auto-arrange runs — the same function as `strategy`
   * for an automatic view, and the default one for a positioned view. A Layout
   * records where its cards are and not how they got there, so a positioned view
   * has no automatic strategy of its own to re-run; recomputing means falling
   * back to the view a space opens in when it names none.
   */
  automatic: LayoutStrategy;
  /**
   * The Layout this view already has, or `null` for an automatic view. It is not
   * a permission: every view is editable, and an automatic one gets a Layout by
   * being edited (ADR 0025). What this answers is whether a save writes to a
   * Layout the author named or to one the app has to mint, which is the only
   * thing that reads it.
   */
  layout: Layout | null;
  /**
   * The routes this view draws — a Layout's filter, or every route (ADR 0026).
   * Authored view scope, decided once by whoever wrote the Layout, and never
   * touched by activating a route. Which routes a view shows is the View's call
   * (ADR 0005), and this is the View making it.
   */
  visibleRouteIds: readonly string[];
  /**
   * Which visible route opens active, or `null` in a space with no routes
   * (ADR 0015). The fallback to the first visible route lives here rather than
   * in the store, so there is one place that answers it (ADR 0026).
   */
  activeRouteId: string | null;
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

function positionMap(layout: Layout): ReadonlyMap<string, LayoutPoint> {
  return new Map(Object.entries(layout.positions));
}

export function resolveView(space: Space): ResolvedView {
  const requested = space.defaultView ?? DEFAULT_VIEW_ID;

  // A declared Layout wins over a built-in of the same name. The space's own
  // data outranks a reserved word, and `loadSpace` permits the collision because
  // which one wins is a resolution decision — this is where it is made.
  const layout = getLayout(space, requested);
  if (layout) {
    return {
      id: layout.id,
      strategy: positionedStrategy(positionMap(layout)),
      automatic: BUILT_IN_STRATEGIES[DEFAULT_VIEW_ID](),
      layout,
      ...resolveRoutes(space, layout),
    };
  }

  // `loadSpace` rejects a `defaultView` naming neither a Layout nor a built-in,
  // so this narrowing cannot fail for a loaded Space; it is a total function
  // rather than a claim about reachability.
  const builtIn = isBuiltInViewId(requested) ? requested : DEFAULT_VIEW_ID;
  // One strategy, not two: an automatic view arranges and re-arranges by the
  // same thing, so Auto-arrange on a grid view re-runs the grid.
  const strategy = BUILT_IN_STRATEGIES[builtIn]();
  // A built-in view carries no Layout and so filters nothing: every route shows,
  // and the first is active.
  return {
    id: builtIn,
    strategy,
    automatic: strategy,
    layout: null,
    ...resolveRoutes(space, null),
  };
}
