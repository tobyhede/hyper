import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { Manifest } from '@project/core';
import type {
  CardHandleSet,
  LayoutCard,
  LayoutGraph,
  RouteEdge,
  RouteHandleRef,
} from '@project/graph';

const FALLBACK_COLOR = '#8a94a6';
const DEFAULT_NODE_HEIGHT = 300;

/** A route handle resolved for rendering: a color and a vertical offset (px from
 *  the node's top) matching where ELK placed the port. */
export type CardHandle = {
  id: string;
  routeId: string;
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
  /** The route being presented, or null in overview mode. Drives handle dimming. */
  activeRouteId: string | null;
  sourceHandles: CardHandle[];
  targetHandles: CardHandle[];
};

export type CardFlowNode = Node<CardNodeData, 'card'>;

export type MarkdownByCardId = Readonly<Record<string, string>>;
export type ColorByRouteId = Readonly<Record<string, string>>;

const EMPTY_HANDLES: CardHandleSet = { sourceHandles: [], targetHandles: [] };

export interface ProjectCardNodesOptions {
  /** Card id of the current presentation step, if any, to flag as active. */
  activeCardId?: string | null;
  /** The route being presented, if any. */
  activeRouteId?: string | null;
  /** The laid-out graph; positions and port offsets come from here when present. */
  layoutGraph?: LayoutGraph;
  /** Node height used to evenly distribute handles before the layout resolves. */
  nodeHeight?: number;
  /** Restrict the projection to these card ids (e.g. one route's cards). */
  cardIds?: readonly string[];
}

function resolveHandles(
  refs: RouteHandleRef[],
  colors: ColorByRouteId,
  card: LayoutCard | undefined,
  nodeHeight: number,
): CardHandle[] {
  const count = refs.length;
  return refs.map((ref, index) => {
    const port = card?.ports.find((p) => p.id === ref.id);
    // Not every layout places ports — a grid has no opinion about them, and ELK
    // has not run yet on first paint. Fall back to an even spread.
    const offsetY = port?.y ?? ((index + 1) / (count + 1)) * nodeHeight;
    return {
      id: ref.id,
      routeId: ref.routeId,
      color: colors[ref.routeId] ?? FALLBACK_COLOR,
      offsetY,
    };
  });
}

/**
 * Map cards → React Flow card nodes, attaching per-route handles positioned at
 * their ELK port offsets and each card's markdown body. The card id is the React
 * Flow node id.
 */
export function projectCardNodes(
  manifest: Manifest,
  markdownByCardId: MarkdownByCardId,
  handlesByCard: ReadonlyMap<string, CardHandleSet>,
  colors: ColorByRouteId,
  options: ProjectCardNodesOptions = {},
): CardFlowNode[] {
  const activeCardId = options.activeCardId ?? null;
  const activeRouteId = options.activeRouteId ?? null;
  const nodeHeight = options.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const visible = options.cardIds ? new Set(options.cardIds) : null;
  const laidOut = new Map((options.layoutGraph?.cards ?? []).map((c) => [c.id, c]));

  const source = visible ? manifest.cards.filter((c) => visible.has(c.id)) : manifest.cards;

  return source.map((card) => {
    const handles = handlesByCard.get(card.id) ?? EMPTY_HANDLES;
    const cardLayout = laidOut.get(card.id);
    const active = card.id === activeCardId;

    return {
      id: card.id,
      type: 'card',
      position: { x: cardLayout?.x ?? 0, y: cardLayout?.y ?? 0 },
      data: {
        cardId: card.id,
        title: card.title,
        markdown: markdownByCardId[card.id] ?? '',
        active,
        activeRouteId,
        sourceHandles: resolveHandles(handles.sourceHandles, colors, cardLayout, nodeHeight),
        targetHandles: resolveHandles(handles.targetHandles, colors, cardLayout, nodeHeight),
      },
      className: active ? 'rf-card-node rf-card-node--active' : 'rf-card-node',
    } satisfies CardFlowNode;
  });
}

export interface ProjectRouteEdgesOptions {
  /** In presentation mode, only the active route's edges stay fully opaque. */
  activeRouteId?: string | null;
  presenting?: boolean;
}

/** Map route-derived edges → colored React Flow edges connected port-to-port. */
export function projectRouteEdges(
  routeEdges: readonly RouteEdge[],
  colors: ColorByRouteId,
  options: ProjectRouteEdgesOptions = {},
): Edge[] {
  const activeRouteId = options.activeRouteId ?? null;
  const presenting = options.presenting ?? false;

  return routeEdges.map((edge) => {
    const color = colors[edge.routeId] ?? FALLBACK_COLOR;
    const isActiveRoute = edge.routeId === activeRouteId;
    const emphasized = !presenting || isActiveRoute;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      // Default (bezier) curves, matching the upstream example.
      className: `rf-route-edge rf-route-edge--${edge.routeId}`,
      animated: emphasized,
      style: {
        stroke: color,
        strokeWidth: isActiveRoute ? 3 : 2,
        opacity: emphasized ? 1 : 0.12,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      data: { routeId: edge.routeId },
    };
  });
}
