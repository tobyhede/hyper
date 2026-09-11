import type { ComponentProps } from 'react';
import {
  BaseEdge,
  getBezierPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
  type InternalNode,
  type Node,
} from '@xyflow/react';
import type { GraphId } from '@project/core';

import {
  edgeAttachment,
  selfEdgeAttachment,
  type AnchorRect,
  type EdgeAttachment,
} from './edge-attachment';

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
 * Takes the attachment rather than the Edge's props: what the props answer is
 * where the *projected* handles were, and the side is chosen from where the two
 * Things are now (ADR 0087).
 */
function routedEdgeGeometry({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeAttachment): RoutedEdgeGeometry {
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

/**
 * The curve and the point a selected Edge's controls sit at, over the anchors
 * this Edge attaches to now.
 *
 * Exported because an application composes a richer Edge over this one —
 * selection controls, a toolbar — and such an Edge needs the same midpoint the
 * path implies. Answering it beside the composition would be a second answer to
 * the same question, and the two would disagree the day the curve changed.
 */
export function useRoutedEdgeGeometry(props: EdgeProps<RoutedFlowEdge>): RoutedEdgeGeometry {
  return routedEdgeGeometry(useEdgeAttachment(props));
}

/**
 * The Edge's curve alone, over a geometry its caller already holds.
 *
 * Separate from `RoutedEdge` so a composition that also draws controls reads the
 * store once: it needs the midpoint anyway, and rendering `RoutedEdge` beneath
 * its own controls would resolve the same attachment a second time.
 */
export function RoutedEdgePath({
  id,
  path,
  markerEnd,
  style,
}: Pick<EdgeProps<RoutedFlowEdge>, 'id' | 'markerEnd' | 'style'> & { path: string }) {
  const baseEdgeProps: ComponentProps<typeof BaseEdge> = { id, path };
  if (markerEnd !== undefined) baseEdgeProps.markerEnd = markerEnd;
  if (style !== undefined) baseEdgeProps.style = style;

  return <BaseEdge {...baseEdgeProps} />;
}

export function RoutedEdge(props: EdgeProps<RoutedFlowEdge>) {
  const { id, markerEnd, style } = props;
  const { path } = useRoutedEdgeGeometry(props);

  const pathProps: ComponentProps<typeof RoutedEdgePath> = { id, path };
  if (markerEnd !== undefined) pathProps.markerEnd = markerEnd;
  if (style !== undefined) pathProps.style = style;

  return <RoutedEdgePath {...pathProps} />;
}

/** The rect React Flow currently holds for a Thing: where it is now, which is
 *  what a drag moves and the projection does not. */
const rectOf = (node: InternalNode<Node>): AnchorRect => ({
  x: node.internals.positionAbsolute.x,
  y: node.internals.positionAbsolute.y,
  width: node.measured.width ?? 0,
  height: node.measured.height ?? 0,
});

/**
 * Where this Edge attaches, decided from where its two Things are at this
 * moment (ADR 0087).
 *
 * The six coordinates React Flow hands down as props answer the same question
 * for the handles the *projection* named, and the projection does not run again
 * during a drag — the render adapter splices live positions into the published
 * projection and leaves the Edges as they were. So an Edge that read its props
 * would stay attached to the side that faced its neighbour when the gesture
 * began, and cross its own Thing until the author let go.
 */
export function useEdgeAttachment(props: EdgeProps<RoutedFlowEdge>): EdgeAttachment {
  const source = useInternalNode(props.source);
  const target = useInternalNode(props.target);
  if (source === undefined || target === undefined) {
    return {
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      sourcePosition: props.sourcePosition,
      targetX: props.targetX,
      targetY: props.targetY,
      targetPosition: props.targetPosition,
    };
  }
  // A Graph may hold an Edge from a Thing to itself (ADR 0032), and the facing
  // rule has nothing to say about one rect. Taken first, before the geometry.
  if (props.source === props.target) return selfEdgeAttachment(rectOf(source));
  return edgeAttachment(rectOf(source), rectOf(target));
}
