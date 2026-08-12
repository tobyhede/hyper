import {
  isBuiltInViewId,
  type BuiltInViewId,
  type Layout,
  type GraphId,
  type UUID,
} from '@project/core';
import {
  getLayout,
  gridStrategy,
  Placement,
  positionedStrategy,
  type LayoutStrategy,
  type Space,
} from '@project/graph';
import { elkStrategy } from '@project/react-flow-adapter';

/**
 * Which view a space opens in, and what that means for arranging and editing.
 *
 * The chain is `space.defaultView` → viewer default → the graph-driven flow.
 * The middle link has no surface yet: a viewer-level preference is named in the
 * spec and deliberately not built, so today the chain is two links long.
 *
 * A view also answers which graphs it shows and which of them opens active
 * (ADR 0026). What it shows follows from its subject: a selected Layout draws
 * the graphs it owns, an Algorithmic View over the Space's cards draws the
 * flatten across every Layout (ADR 0040, ADR 0045). The active one is read off
 * the resolved Layout and falls back, so the answer exists for every space —
 * including one with no Layout, which is one with no graphs at all.
 *
 * This lives in `app` rather than `graph` because resolving a view means
 * choosing a strategy, and `elkStrategy` lives in the adapter — `graph` may not
 * reach for it. Composition is exactly this file's job.
 */

/** Where a space opens when it names no view of its own. */
export const DEFAULT_VIEW_ID: BuiltInViewId = 'flow';

const BUILT_IN_STRATEGIES: Record<BuiltInViewId, () => LayoutStrategy> = {
  flow: elkStrategy,
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
   * The graphs this view draws: the ones a selected Layout owns, or the Space
   * flatten under an Algorithmic View. It stays a field rather than collapsing
   * into `space.graphs` at each reader because which graphs a view shows is the
   * View's call (ADR 0005), and the two answers now differ.
   */
  visibleGraphIds: readonly GraphId[];
  /**
   * Which visible graph opens active, or `null` in a space with no graphs
   * (ADR 0015). The fallback to the first visible graph lives here rather than
   * in the store, so there is one place that answers it (ADR 0026).
   */
  activeGraphId: GraphId | null;
}

/** The one renderer currently navigating a Space (ADR 0031). */
export type RendererSelection =
  | { readonly kind: 'view'; readonly view: BuiltInViewId }
  | { readonly kind: 'layout'; readonly layoutId: UUID };

/**
 * Which graphs a view draws and which of them opens active.
 *
 * A selected Layout draws the graphs **it owns** (ADR 0040); an Algorithmic
 * View, whose subject is the Space's cards, draws every graph in the Space —
 * the flatten across every Layout, which `Space.graphs` already is (ADR 0045).
 * Those are two subjects, not two kinds of view.
 *
 * A read, never a write: an author's space needs neither answer written down,
 * and both are computed rather than filled in. What the app *saves* names the
 * active graph outright, which is a different rule and lives in `snapshot.ts`
 * (ADR 0028).
 */
function resolveGraphs(
  space: Space,
  layout: Layout | null,
): Pick<ResolvedView, 'visibleGraphIds' | 'activeGraphId'> {
  const visibleGraphIds = (layout?.graphs ?? space.graphs).map((graph) => graph.id);
  return {
    visibleGraphIds,
    // `loadSpace` has already checked that a named `activeGraph` is one this
    // Layout owns, so the `??` is the absent case and not a repair of a bad
    // reference. The fallback runs over what the view draws — a Layout falling
    // back to the Space's first graph would open active on one it does not own.
    activeGraphId: layout?.activeGraph ?? visibleGraphIds[0] ?? null,
  };
}

/**
 * Whether a resolved view draws a Graph.
 *
 * The membership test for the set `resolveGraphs` answers, and it lives beside
 * it so the question and the one answer to it sit in the same module (ADR 0026).
 * It reads `visibleGraphIds` rather than deciding visibility a second time —
 * Navigation asks this, and a Navigation that computed its own answer would
 * disagree with the renderer the moment the two sets differ again.
 */
export const viewShowsGraph = (view: ResolvedView, graphId: GraphId): boolean =>
  view.visibleGraphIds.includes(graphId);

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
      strategy: positionedStrategy(Placement.fromLayout(layout)),
      layout,
      ...resolveGraphs(space, layout),
    };
  }

  const strategy = BUILT_IN_STRATEGIES[selection.view]();
  // A built-in view carries no Layout, so it has no authored active graph to
  // read: every graph shows, and the first is active.
  return {
    id: selection.view,
    strategy,
    layout: null,
    ...resolveGraphs(space, null),
  };
}
