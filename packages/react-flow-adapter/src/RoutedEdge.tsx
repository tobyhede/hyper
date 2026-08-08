import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { LayoutPosition, GraphId } from '@project/core';

/**
 * React Flow custom edge that draws the polyline ELK routed, not a bezier.
 *
 * ELK computes where each edge runs — around the cards, as a channel — and the
 * app used to throw that away and let React Flow draw its own curve between the
 * two handles. A forward edge looks fine either way; a back-edge (target left of
 * source, e.g. two graphs disagreeing on the order of cards they share) does not:
 * the bezier leaves
 * rightward and hooks back on itself, reading as a broken stub. Drawing ELK's
 * routed points instead makes it a clean channel. See
 * `.scratch/layout-seam/issues/03-render-elk-edge-routing.md`.
 *
 * The points are in the same coordinate space as the node positions (both come
 * from ELK verbatim), so they map straight onto React Flow's flow coordinates.
 * When a layout places no routing (grid, or before ELK resolves on first paint)
 * we fall back to a bezier between the handles React Flow already knows.
 */
export type RoutedEdgeData = {
  graphId: GraphId;
  /** ELK's routed path, start → bends → end. Absent until a routing layout runs. */
  points?: LayoutPosition[];
};

/**
 * The edge as React Flow knows it. Naming the data and the type discriminant is
 * what lets `EdgeProps` hand back a typed `data` instead of an `unknown` to cast.
 */
export type RoutedFlowEdge = Edge<RoutedEdgeData, 'routed'>;

function polyline(points: LayoutPosition[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export function RoutedEdge({
  id,
  data,
  markerEnd,
  style,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<RoutedFlowEdge>) {
  const points = data?.points;

  const path =
    points && points.length >= 2
      ? polyline(points)
      : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0];

  return (
    <BaseEdge
      id={id}
      path={path}
      {...(markerEnd !== undefined ? { markerEnd } : {})}
      {...(style !== undefined ? { style } : {})}
    />
  );
}
