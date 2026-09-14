import { useMemo } from 'react';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import type { CanvasNodesAndEdges } from './canvas-projection';
import {
  embeddedDiagram,
  type EmbeddedBounds,
  type EmbeddedParentProjection,
} from './embedded-diagram';
import type { DiagramPosition } from '@project/core';

export interface EmbeddedDrawingRequest {
  readonly parent: ThingFlowNode;
  readonly projection: CanvasNodesAndEdges;
  readonly offset: DiagramPosition;
  readonly enabled: boolean;
  readonly bounds: EmbeddedBounds;
}

/** Retain every projected node and Edge while React Flow translates their parent. */
export function useEmbeddedDiagram({
  parent,
  projection,
  offset,
  enabled,
  bounds,
}: EmbeddedDrawingRequest): CanvasNodesAndEdges {
  const parentId = parent.id;
  const parentWidth = parent.width;
  const parentHeight = parent.height;
  const parentZIndex = parent.zIndex;
  const projectionParent = useMemo(
    (): EmbeddedParentProjection => ({
      id: parentId,
      width: parentWidth,
      height: parentHeight,
      zIndex: parentZIndex,
    }),
    [parentId, parentWidth, parentHeight, parentZIndex],
  );
  const { left, top, right, bottom } = bounds;
  const offsetX = offset.x;
  const offsetY = offset.y;
  return useMemo(
    () =>
      embeddedDiagram({
        parent: projectionParent,
        projection,
        offset: { x: offsetX, y: offsetY },
        enabled,
        bounds: { left, top, right, bottom },
      }),
    [projectionParent, projection, offsetX, offsetY, enabled, left, top, right, bottom],
  );
}
