import type { Edge } from '@xyflow/react';
import { SPACE_CARD_EMBED_INSET, type LayoutPosition } from '@project/core';
import type { CardFlowNode } from '@project/react-flow-adapter';
import type { CanvasNodesAndEdges } from './canvas-projection';

/** A placement identity: the same target Card can appear through several Space Cards. */
export const embeddedNodeId = (parentId: string, cardId: string): string =>
  `embedded:${parentId}:${cardId}`;
export const embeddedClipId = (parentId: string): string => `embedded-clip-${parentId}`;

export interface EmbeddedBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface EmbeddedLayoutRequest {
  readonly parent: CardFlowNode;
  readonly projection: CanvasNodesAndEdges;
  readonly offset: LayoutPosition;
  readonly enabled: boolean;
  readonly bounds?: EmbeddedBounds;
}

/** Reclip a retained read as its containing Card changes size, without opening a session. */
export function clipEmbeddedNode(node: CardFlowNode, bounds: EmbeddedBounds): CardFlowNode {
  const top = Math.max(0, bounds.top - node.position.y);
  const left = Math.max(0, bounds.left - node.position.x);
  const right = Math.max(0, node.position.x + (node.width ?? 0) - bounds.right);
  const bottom = Math.max(0, node.position.y + (node.height ?? 0) - bounds.bottom);
  return {
    ...node,
    style: { ...node.style, clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px)` },
  };
}

/** Reparent the production projection, clipping partial Cards instead of dropping them. */
export function embeddedLayout({
  parent,
  projection,
  offset,
  enabled,
  bounds,
}: EmbeddedLayoutRequest): CanvasNodesAndEdges {
  const nodes = projection.nodes.map((node): CardFlowNode => {
    const position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
    return clipEmbeddedNode(
      {
        ...node,
        id: embeddedNodeId(parent.id, node.id),
        parentId: parent.id,
        // Coordinate bounds constrain child gestures without making the parent
        // resizer refuse to clip its children or reach the Close magnet.
        extent: [
          [0, 0],
          [parent.width ?? 0, parent.height ?? 0],
        ],
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
        top: SPACE_CARD_EMBED_INSET.top,
        left: SPACE_CARD_EMBED_INSET.left,
        right: (parent.width ?? 0) - SPACE_CARD_EMBED_INSET.right,
        bottom: (parent.height ?? 0) - SPACE_CARD_EMBED_INSET.bottom,
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
