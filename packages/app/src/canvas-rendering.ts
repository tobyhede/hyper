import { useCallback, useEffect, useMemo } from 'react';
import type { GraphId, ResourceId } from '@project/core';
import type { Placement } from '@project/graph';
import { canvasContent, type CanvasContent } from './canvas-content';
import type { CanvasNodesAndEdges, PendingCanvasProjection } from './canvas-projection';
import { usePlacementRendering } from './placement-rendering';
import {
  selectedResourceOf,
  type CanvasSelection,
  type EdgeSubject,
  type Projection,
  type RenderAdapter,
  type RenderAdapterState,
} from './render-adapter';

export interface CanvasRenderingInput {
  readonly projection: PendingCanvasProjection;
  readonly mapPlacement: Placement;
  readonly activeGraphId: GraphId | null;
  readonly activeResourceId: ResourceId | null;
  readonly presenting: boolean;
}

export interface CanvasRendering {
  readonly selection: CanvasSelection;
  /** What the render adapter holds and React Flow draws. */
  readonly liveProjection: Projection | null;
  /** Resources are on the canvas once placement resolves and the adapter has taken it. */
  readonly hasResourcesOnCanvas: boolean;
  /**
   * Whether an embedded Map on this canvas is running an edit — reported by the
   * canvas, which is the only place it can be seen, and read back out of the
   * adapter so the answers derived from it reach the command surface and the
   * canvas in one render.
   */
  readonly editingEmbeddedMap: boolean;
  /** What the placed Map projects to, or `null` while no strategy has resolved. */
  readonly projected: CanvasNodesAndEdges | null;
  readonly canvas: CanvasContent;
  readonly changeNodes: RenderAdapterState['changeNodes'];
  readonly changeEdges: RenderAdapterState['changeEdges'];
  readonly resourceResize: RenderAdapterState['resourceResize'];
  readonly reportEmbeddedMapEditing: RenderAdapterState['reportEmbeddedMapEditing'];
  readonly selectResource: (resourceId: ResourceId) => void;
  readonly selectEdge: (subject: EdgeSubject) => void;
}

/**
 * The drawn Map through the placement strategy and into the render adapter.
 *
 * A resize draft's placement stands in for the Map's own while it runs. Nothing
 * is worth projecting before a strategy resolves — every Resource would sit at
 * the origin — and `project` will not take a null `LayoutStrategyGraph`, so the
 * `projected` gate is the whole of that rule. The complete projection reaches
 * the adapter as one state change: a Resource keeps its live position, measured
 * size and drag state, while an Edge can never become visible before the
 * endpoint nodes declare its handles.
 */
export function useCanvasRendering(
  useRenderAdapter: RenderAdapter,
  { projection, mapPlacement, activeGraphId, activeResourceId, presenting }: CanvasRenderingInput,
): CanvasRendering {
  const resizeDraft = useRenderAdapter((s) => s.resizeDraft);
  const selection = useRenderAdapter((s) => s.selection);
  const liveProjection = useRenderAdapter((s) => s.projection);
  const editingEmbeddedMap = useRenderAdapter((s) => s.editingEmbeddedMap);
  const syncProjection = useRenderAdapter((s) => s.syncProjection);
  const changeNodes = useRenderAdapter((s) => s.changeNodes);
  const changeEdges = useRenderAdapter((s) => s.changeEdges);
  const resourceResize = useRenderAdapter((s) => s.resourceResize);
  const reportEmbeddedMapEditing = useRenderAdapter((s) => s.reportEmbeddedMapEditing);
  const selectedResourceId = selectedResourceOf(selection);

  const placement = usePlacementRendering(
    projection.strategyGraph,
    resizeDraft?.placement ?? mapPlacement,
  );
  const laidOut = placement.kind === 'ready' ? placement.strategyGraph : null;
  const projected = useMemo(
    () =>
      laidOut === null
        ? null
        : projection.project(laidOut, {
            activeGraphId,
            activeResourceId,
            selectedResourceId,
            presenting,
          }),
    [projection, laidOut, activeGraphId, activeResourceId, selectedResourceId, presenting],
  );
  useEffect(() => {
    if (projected) syncProjection(projected.nodes, projected.edges);
  }, [projected, syncProjection]);

  // The two selection writes the canvas makes that are not React Flow's own —
  // continuing at a connected Resource, and the focus-to-selection bridge for an
  // Edge. Both are plain store writes with nothing to decide.
  const selectResource = useCallback(
    (resourceId: ResourceId) => {
      useRenderAdapter.getState().selectResource(resourceId);
    },
    [useRenderAdapter],
  );
  const selectEdge = useCallback(
    (subject: EdgeSubject) => {
      useRenderAdapter.getState().selectEdge(subject);
    },
    [useRenderAdapter],
  );

  const hasResourcesOnCanvas = liveProjection !== null;
  return {
    selection,
    liveProjection,
    hasResourcesOnCanvas,
    editingEmbeddedMap,
    projected,
    canvas: canvasContent(placement, hasResourcesOnCanvas),
    changeNodes,
    changeEdges,
    resourceResize,
    reportEmbeddedMapEditing,
    selectResource,
    selectEdge,
  };
}
