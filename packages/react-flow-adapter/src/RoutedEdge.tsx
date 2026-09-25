import type { ComponentProps } from 'react';
import {
  BaseEdge,
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
import { laneBezier } from './edge-lanes';

/**
 * React Flow custom edge that draws a bezier between the two handles.
 *
 * The bezier is the only edge geometry the product draws: a strategy answers no
 * waypoints and a Map has nowhere to store one (ADR 0086). Where it attaches is
 * settled by ADR 0087 and answered below by `useEdgeAttachment`, from where the
 * two Resources are at that moment.
 */
export type RoutedEdgeData = {
  graphId: GraphId;
  /**
   * How far below (or right of) where its two anchors put it this Edge is
   * drawn — above (or left) when negative — so the Edges of several
   * Graphs joining the same two Resources run as parallel lines rather than over
   * each other. Zero for a lone Edge.
   */
  laneOffset: number;
  /**
   * How far from the centre line the outermost lane of this Edge's pair runs.
   * Every lane of the pair is drawn the same way at that distance, so they
   * never run out of order (ADR 0103).
   */
  laneReach: number;
  /**
   * What fraction of its length the Edge leaves undrawn at each end. Zero for
   * an Edge that connects; a Graph other than the Active one runs beside it and
   * stops short.
   */
  endTrim: number;
  /** The Edge's Title and whether it is hidden at rest; drawn by the application, not here. */
  title?: string;
  titleHidden?: true;
};

/**
 * The React Flow Edge type the canvas projection writes, and the key it is
 * registered under. One constant, because what reads an Edge back into a domain
 * subject gates on this type: a second spelling that drifted from the projection's
 * would quietly turn every Edge's controls off.
 */
export const ROUTED_EDGE_TYPE = 'routed';

/**
 * The edge as React Flow knows it. Naming the data and the type discriminant is
 * what lets `EdgeProps` hand back a typed `data` instead of an `unknown` to cast.
 */
export type RoutedFlowEdge = Edge<RoutedEdgeData, typeof ROUTED_EDGE_TYPE>;

/** An Edge's drawn path, the point a label or toolbar sits at, and how far it reaches. */
export interface RoutedEdgeGeometry {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  /** See `LaneGeometry.span`. */
  readonly span: number;
}

/**
 * The one decision about how a routed Edge is drawn, and where its middle is.
 *
 * Takes the attachment rather than the Edge's props: what the props answer is
 * where the *projected* handles were, and the side is chosen from where the two
 * Resources are now (ADR 0087). The lane is the projection's, because only the
 * projection sees every Edge that shares this one's pair.
 */
function routedEdgeGeometry(
  attachment: EdgeAttachment,
  { laneOffset, laneReach, endTrim }: Pick<RoutedEdgeData, 'laneOffset' | 'laneReach' | 'endTrim'>,
): RoutedEdgeGeometry {
  return laneBezier(attachment, laneOffset, endTrim, laneReach);
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
  return routedEdgeGeometry(
    useEdgeAttachment(props),
    props.data ?? { laneOffset: 0, laneReach: 0, endTrim: 0 },
  );
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

/**
 * What `RoutedEdgePath` forwards to `BaseEdge`, built from an Edge's own props
 * and the path it drew.
 *
 * Offered because the application composes its own Edge over `RoutedEdgePath`
 * and so assembles the same object — and `exactOptionalPropertyTypes` makes that
 * three conditional lines rather than a spread, which is exactly the shape that
 * gets copied and then diverges. One producer, so the day the path component
 * forwards a fourth prop there is one place it reaches.
 */
export function routedEdgePathProps(
  { id, markerEnd, style }: Pick<EdgeProps<RoutedFlowEdge>, 'id' | 'markerEnd' | 'style'>,
  path: string,
): ComponentProps<typeof RoutedEdgePath> {
  const props: ComponentProps<typeof RoutedEdgePath> = { id, path };
  if (markerEnd !== undefined) props.markerEnd = markerEnd;
  if (style !== undefined) props.style = style;
  return props;
}

export function RoutedEdge(props: EdgeProps<RoutedFlowEdge>) {
  const { path } = useRoutedEdgeGeometry(props);
  return <RoutedEdgePath {...routedEdgePathProps(props, path)} />;
}

/**
 * The rect React Flow currently holds for a Resource: where it is now, which is
 * what a drag moves and the projection does not.
 *
 * The size is read the way React Flow's own `getNodeDimensions` reads it —
 * measured first, then what the projection declared — so a Resource whose rect the
 * Map placed attaches correctly before anything has been measured.
 */
const rectOf = (node: InternalNode<Node>): AnchorRect => ({
  x: node.internals.positionAbsolute.x,
  y: node.internals.positionAbsolute.y,
  width: node.measured.width ?? node.width ?? 0,
  height: node.measured.height ?? node.height ?? 0,
});

/**
 * Where this Edge attaches, decided from where its two Resources are at this
 * moment (ADR 0087).
 *
 * The six coordinates React Flow hands down as props answer the same question
 * for the handles the *projection* named, and the projection does not run again
 * during a drag — the render adapter splices live positions into the published
 * projection and leaves the Edges as they were. So an Edge that read its props
 * would stay attached to the side that faced its neighbour when the gesture
 * began, and cross its own Resource until the author let go.
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
  // A Graph may hold an Edge from a Resource to itself (ADR 0032), and the facing
  // rule has nothing to say about one rect. Taken first, before the geometry.
  if (props.source === props.target) return selfEdgeAttachment(rectOf(source));
  return edgeAttachment(rectOf(source), rectOf(target));
}
