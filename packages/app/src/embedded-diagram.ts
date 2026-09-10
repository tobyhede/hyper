import type { Edge } from '@xyflow/react';
import { SPACE_THING_EMBED_INSET, type DiagramPosition } from '@project/core';
import type { ThingFlowNode } from '@project/react-flow-adapter';
import type { CanvasNodesAndEdges } from './canvas-projection';

/** A placement identity: the same target Thing can appear through several Space Things. */
export const embeddedNodeId = (parentId: string, thingId: string): string =>
  `embedded:${parentId}:${thingId}`;
export const embeddedClipId = (parentId: string): string => `embedded-clip-${parentId}`;

export interface EmbeddedBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface EmbeddedDiagramRequest {
  readonly parent: ThingFlowNode;
  readonly projection: CanvasNodesAndEdges;
  readonly offset: DiagramPosition;
  readonly enabled: boolean;
  readonly bounds?: EmbeddedBounds;
}

/**
 * How much of a proposed Thing stays inside the drawn region, so a gesture can
 * always take it back out. The proposal is held by its top-left corner and the
 * Thing's own extent is not known here, so the sliver is what the corner keeps
 * clear of the right and bottom edges.
 */
const EMBEDDED_GRAB_SLIVER = 24;

/**
 * Hold a gesture proposal inside the region the Thing is actually drawn in.
 *
 * That region is the request's {@link EmbeddedBounds} — what `SpaceCanvas`
 * intersects from the containing Thing's box less {@link SPACE_THING_EMBED_INSET}
 * and every ancestor's clip — and not the containing Thing's own box: a proposal
 * accepted outside it is clipped by `clipEmbeddedNode` rather than drawn, and
 * taken to the corner it is clipped away entirely while the move is still
 * committed to the target Space's Diagram. Taking the bounds rather than the
 * node is what makes a nested embedding hold to the region an ancestor leaves
 * it, which its containing Thing's box alone does not know about.
 *
 * Deliberately *not* React Flow's `extent`. A numeric extent is applied by
 * `adoptUserNodes`, which runs on every render and not only on a drag, so an
 * extent narrower than the authored placement redraws the Diagram: a Thing
 * authored beyond the containing bounds would be moved to the edge while
 * `clipEmbeddedNode` still clips from where it was authored, and shrinking the
 * containing Thing would shift its children rather than reveal less of them. A
 * Thing that no longer fits is clipped (ADR 0068); only what a pointer or key
 * *proposes* is constrained, and that is this function's job.
 */
export function constrainEmbeddedPosition(
  position: DiagramPosition,
  bounds: EmbeddedBounds,
): DiagramPosition {
  const hold = (value: number, least: number, most: number): number =>
    Math.min(Math.max(value, least), Math.max(least, most));
  return {
    x: hold(position.x, bounds.left, bounds.right - EMBEDDED_GRAB_SLIVER),
    y: hold(position.y, bounds.top, bounds.bottom - EMBEDDED_GRAB_SLIVER),
  };
}

/** Reclip a retained read as its containing Thing changes size, without opening a session. */
export function clipEmbeddedNode(node: ThingFlowNode, bounds: EmbeddedBounds): ThingFlowNode {
  const top = Math.max(0, bounds.top - node.position.y);
  const left = Math.max(0, bounds.left - node.position.x);
  const right = Math.max(0, node.position.x + (node.width ?? 0) - bounds.right);
  const bottom = Math.max(0, node.position.y + (node.height ?? 0) - bounds.bottom);
  return {
    ...node,
    style: { ...node.style, clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)` },
  };
}

/** Reparent the production projection, clipping partial Things instead of dropping them. */
export function embeddedDiagram({
  parent,
  projection,
  offset,
  enabled,
  bounds,
}: EmbeddedDiagramRequest): CanvasNodesAndEdges {
  const nodes = projection.nodes.map((node): ThingFlowNode => {
    const position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
    return clipEmbeddedNode(
      {
        ...node,
        id: embeddedNodeId(parent.id, node.id),
        parentId: parent.id,
        position,
        connectable: false,
        data: { ...node.data, connectionAuthoringEnabled: false },
        draggable: enabled,
        selectable: enabled,
        focusable: enabled,
        deletable: false,
        zIndex: (parent.zIndex ?? 10) + (node.data.expanded === true ? 2 : 1),
      },
      bounds ?? {
        top: SPACE_THING_EMBED_INSET.top,
        left: SPACE_THING_EMBED_INSET.left,
        right: (parent.width ?? 0) - SPACE_THING_EMBED_INSET.right,
        bottom: (parent.height ?? 0) - SPACE_THING_EMBED_INSET.bottom,
      },
    );
  });
  const ids = new Map(
    projection.nodes.map((node) => [node.id, embeddedNodeId(parent.id, node.id)]),
  );
  const edges = projection.edges.flatMap((edge): Edge[] => {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    return source === undefined || target === undefined
      ? []
      : [
          {
            ...edge,
            id: `${parent.id}:${edge.id}`,
            source,
            target,
            selectable: false,
            focusable: false,
            reconnectable: false,
            deletable: false,
            interactionWidth: 0,
            zIndex: (parent.zIndex ?? 10) + 1,
            style: { ...edge.style, clipPath: `url("#${embeddedClipId(parent.id)}")` },
          },
        ];
  });
  return { nodes, edges };
}
