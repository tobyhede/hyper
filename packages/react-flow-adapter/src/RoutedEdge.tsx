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

/** Where a routed polyline reads as its middle: the point half its length along,
 *  interpolated within whichever segment spans it rather than snapped to a bend. */
function polylineMidpoint(points: LayoutPosition[]): LayoutPosition {
  const lengths = points.map((point, index) => {
    const previous = points[index - 1];
    if (previous === undefined) return 0;
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let travelled = 0;
  for (const [index, length] of lengths.entries()) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous === undefined || point === undefined) continue;
    if (travelled + length >= total / 2) {
      const along = length === 0 ? 0 : (total / 2 - travelled) / length;
      return {
        x: previous.x + (point.x - previous.x) * along,
        y: previous.y + (point.y - previous.y) * along,
      };
    }
    travelled += length;
  }
  return points[0] ?? { x: 0, y: 0 };
}

/** An Edge's drawn path and the point a label or toolbar sits at. */
export interface RoutedEdgeGeometry {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
}

/**
 * The one decision about how a routed Edge is drawn, and where its middle is.
 *
 * Exported because an application may compose a richer Edge over this one —
 * selection controls, a toolbar — and such an Edge needs the same midpoint the
 * path implies. Recomputing it beside the composition would be a second answer
 * to "is this Edge routed", and the two would disagree the first time a layout
 * stopped placing sections.
 */
export function routedEdgeGeometry({
  data,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<RoutedFlowEdge>): RoutedEdgeGeometry {
  const points = data?.points;
  if (points && points.length >= 2) {
    const middle = polylineMidpoint(points);
    return { path: polyline(points), labelX: middle.x, labelY: middle.y };
  }
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return { path, labelX, labelY };
}

export function RoutedEdge(props: EdgeProps<RoutedFlowEdge>) {
  const { id, markerEnd, style } = props;
  const { path } = routedEdgeGeometry(props);

  return (
    <BaseEdge
      id={id}
      path={path}
      {...(markerEnd !== undefined ? { markerEnd } : {})}
      {...(style !== undefined ? { style } : {})}
    />
  );
}
