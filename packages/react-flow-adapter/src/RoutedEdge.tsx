import type { ComponentProps } from 'react';
import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import type { GraphId } from '@project/core';

/**
 * React Flow custom edge that draws a bezier between the two handles.
 *
 * It kept a second branch until ADR 0086: a polyline along the waypoints a
 * routing strategy had placed, for a back-edge (target left of source, e.g. two
 * graphs disagreeing on the order of things they share) whose bezier leaves
 * rightward and hooks back on itself. That branch never executed in the
 * application — no strategy in the tree ever emitted a routed section, and a
 * Diagram has nowhere to store one — so the bezier is, and always was, the only
 * edge geometry the product draws. The name stays because the edge is still the
 * one drawn along a Graph; where it attaches is `.scratch/edge-attachment/`'s
 * open question.
 */
export type RoutedEdgeData = {
  graphId: GraphId;
};

/**
 * The edge as React Flow knows it. Naming the data and the type discriminant is
 * what lets `EdgeProps` hand back a typed `data` instead of an `unknown` to cast.
 */
export type RoutedFlowEdge = Edge<RoutedEdgeData, 'routed'>;

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
 * to the same question, and the two would disagree the day the curve changed.
 */
export function routedEdgeGeometry({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<RoutedFlowEdge>): RoutedEdgeGeometry {
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

  const baseEdgeProps: ComponentProps<typeof BaseEdge> = { id, path };
  if (markerEnd !== undefined) baseEdgeProps.markerEnd = markerEnd;
  if (style !== undefined) baseEdgeProps.style = style;

  return <BaseEdge {...baseEdgeProps} />;
}
