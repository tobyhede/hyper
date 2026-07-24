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
   * The Layout this view writes placement into, or `null` for an automatic
   * view. Its presence *is* the permission to edit (ADR 0013): an automatic view
   * has nowhere to record where an author put a card, so it is read-only. There
   * is no edit mode, and nothing to keep in sync with one.
   */
  layout: Layout | null;
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
    return { id: layout.id, strategy: positionedStrategy(positionMap(layout)), layout };
  }

  // `loadSpace` rejects a `defaultView` naming neither a Layout nor a built-in,
  // so this narrowing cannot fail for a loaded Space; it is a total function
  // rather than a claim about reachability.
  const builtIn = isBuiltInViewId(requested) ? requested : DEFAULT_VIEW_ID;
  return { id: builtIn, strategy: BUILT_IN_STRATEGIES[builtIn](), layout: null };
}
