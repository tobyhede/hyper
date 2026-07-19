import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { Manifest } from '@project/core';
import type { CardHandleSet, PathEdge, PathHandleRef } from '@project/graph';
import type { ElkLayoutResult, ElkNodeLayout } from './elk/types';

const FALLBACK_COLOR = '#8a94a6';
const DEFAULT_NODE_HEIGHT = 300;

/** A path handle resolved for rendering: a color and a vertical offset (px from
 *  the node's top) matching where ELK placed the port. */
export type CardHandle = {
  id: string;
  pathId: string;
  color: string;
  offsetY: number;
};

/** Data carried by each custom card node. Kept as a type alias so it satisfies
 *  React Flow's `Record<string, unknown>` data constraint, and it includes the
 *  handle arrays the ELK layout needs. */
export type CardNodeData = {
  cardId: string;
  title: string;
  markdown: string;
  active: boolean;
  /** The path being presented, or null in overview mode. Drives handle dimming. */
  activePathId: string | null;
  sourceHandles: CardHandle[];
  targetHandles: CardHandle[];
};

export type CardFlowNode = Node<CardNodeData, 'card'>;

export type MarkdownByCardId = Readonly<Record<string, string>>;
export type ColorByPathId = Readonly<Record<string, string>>;

const EMPTY_HANDLES: CardHandleSet = { sourceHandles: [], targetHandles: [] };

export interface ProjectCardNodesOptions {
  /** Card id of the current presentation step, if any, to flag as active. */
  activeCardId?: string | null;
  /** The path being presented, if any. */
  activePathId?: string | null;
  /** ELK layout result; positions and port offsets come from here when present. */
  layout?: ElkLayoutResult;
  /** Node height used to evenly distribute handles before the layout resolves. */
  nodeHeight?: number;
  /** Restrict the projection to these card ids (e.g. one path's cards). */
  cardIds?: readonly string[];
}

function resolveHandles(
  refs: PathHandleRef[],
  colors: ColorByPathId,
  nodeLayout: ElkNodeLayout | undefined,
  nodeHeight: number,
): CardHandle[] {
  const count = refs.length;
  return refs.map((ref, index) => {
    const port = nodeLayout?.ports[ref.id];
    // Fall back to an even spread until ELK has run.
    const offsetY = port?.y ?? ((index + 1) / (count + 1)) * nodeHeight;
    return {
      id: ref.id,
      pathId: ref.pathId,
      color: colors[ref.pathId] ?? FALLBACK_COLOR,
      offsetY,
    };
  });
}

/**
 * Map cards → React Flow card nodes, attaching per-path handles positioned at
 * their ELK port offsets and each card's markdown body. The card id is the React
 * Flow node id.
 */
export function projectCardNodes(
  manifest: Manifest,
  markdownByCardId: MarkdownByCardId,
  handlesByCard: ReadonlyMap<string, CardHandleSet>,
  colors: ColorByPathId,
  options: ProjectCardNodesOptions = {},
): CardFlowNode[] {
  const activeCardId = options.activeCardId ?? null;
  const activePathId = options.activePathId ?? null;
  const layout = options.layout;
  const nodeHeight = options.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const visible = options.cardIds ? new Set(options.cardIds) : null;

  const source = visible ? manifest.cards.filter((c) => visible.has(c.id)) : manifest.cards;

  return source.map((card) => {
    const handles = handlesByCard.get(card.id) ?? EMPTY_HANDLES;
    const cardLayout = layout?.[card.id];
    const active = card.id === activeCardId;
    const position = cardLayout ?? { x: 0, y: 0 };

    return {
      id: card.id,
      type: 'card',
      position: { x: position.x, y: position.y },
      data: {
        cardId: card.id,
        title: card.title,
        markdown: markdownByCardId[card.id] ?? '',
        active,
        activePathId,
        sourceHandles: resolveHandles(handles.sourceHandles, colors, cardLayout, nodeHeight),
        targetHandles: resolveHandles(handles.targetHandles, colors, cardLayout, nodeHeight),
      },
      className: active ? 'rf-card-node rf-card-node--active' : 'rf-card-node',
    } satisfies CardFlowNode;
  });
}

export interface ProjectPathEdgesOptions {
  /** In presentation mode, only the active path's rail stays fully opaque. */
  activePathId?: string | null;
  presenting?: boolean;
}

/** Map path-derived edges → colored React Flow edges connected port-to-port. */
export function projectPathEdges(
  pathEdges: readonly PathEdge[],
  colors: ColorByPathId,
  options: ProjectPathEdgesOptions = {},
): Edge[] {
  const activePathId = options.activePathId ?? null;
  const presenting = options.presenting ?? false;

  return pathEdges.map((edge) => {
    const color = colors[edge.pathId] ?? FALLBACK_COLOR;
    const isActivePath = edge.pathId === activePathId;
    const emphasized = !presenting || isActivePath;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      // Default (bezier) curves, matching the upstream example.
      className: `rf-path-edge rf-path-edge--${edge.pathId}`,
      animated: emphasized,
      style: {
        stroke: color,
        strokeWidth: isActivePath ? 3 : 2,
        opacity: emphasized ? 1 : 0.12,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      data: { pathId: edge.pathId },
    };
  });
}
