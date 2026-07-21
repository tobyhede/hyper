import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import { resolveContentCard } from '@project/graph';
import type {
  CardHandleSet,
  LayoutCard,
  LayoutGraph,
  RouteEdge,
  RouteHandleRef,
  Space,
} from '@project/graph';

const FALLBACK_COLOR = '#8a94a6';
const DEFAULT_NODE_HEIGHT = 300;

/**
 * How strongly routes other than the active one recede.
 *
 * A level rather than a boolean, because a view may want more than on/off — and
 * because the adapter should not know that the app has modes. It once carried a
 * third, 'strong', for dimming the graph while presenting; presenting no longer
 * draws the graph at all (ADR 0008), so that level had no caller.
 */
export type RouteEmphasis = 'equal' | 'subtle';

/** Opacity applied to routes that are not the active one. */
export const OTHER_ROUTE_OPACITY: Record<RouteEmphasis, number> = {
  equal: 1,
  subtle: 0.35,
};

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
  /** For an alias, the title of the card it shows — so the node can name what it
   *  redraws. Absent on non-alias cards. */
  aliasOf?: string;
  active: boolean;
  /** The route being emphasised, if any. Drives handle dimming. */
  activeRouteId: string | null;
  emphasis: RouteEmphasis;
  sourceHandles: CardHandle[];
  targetHandles: CardHandle[];
};

export type CardFlowNode = Node<CardNodeData, 'card'>;

export type ColorByRouteId = Readonly<Record<string, string>>;

const EMPTY_HANDLES: CardHandleSet = { sourceHandles: [], targetHandles: [] };

export interface ProjectCardNodesOptions {
  /** Card id of the current presentation step, if any, to flag as active. */
  activeCardId?: string | null;
  /** The route to emphasise, if any. */
  activeRouteId?: string | null;
  emphasis?: RouteEmphasis;
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
 * their ELK port offsets. The card id is the React Flow node id.
 *
 * A node carries its card's *title*, not its content (ADR 0006) — the content is
 * loaded when a card is opened or presented, not embedded in every node.
 */
export function projectCardNodes(
  space: Space,
  handlesByCard: ReadonlyMap<string, CardHandleSet>,
  colors: ColorByRouteId,
  options: ProjectCardNodesOptions = {},
): CardFlowNode[] {
  const activeCardId = options.activeCardId ?? null;
  const activeRouteId = options.activeRouteId ?? null;
  const emphasis = options.emphasis ?? 'equal';
  const nodeHeight = options.nodeHeight ?? DEFAULT_NODE_HEIGHT;
  const visible = options.cardIds ? new Set(options.cardIds) : null;
  const laidOut = new Map((options.layoutGraph?.cards ?? []).map((c) => [c.id, c]));

  const source = visible ? space.cards.filter((c) => visible.has(c.id)) : space.cards;

  return source.map((card) => {
    const handles = handlesByCard.get(card.id) ?? EMPTY_HANDLES;
    const cardLayout = laidOut.get(card.id);
    const active = card.id === activeCardId;
    // An alias names the card it redraws; a markdown card names nothing (ADR 0009).
    const aliasOf = card.kind === 'alias' ? resolveContentCard(space, card.id)?.title : undefined;

    return {
      id: card.id,
      type: 'card',
      position: { x: cardLayout?.x ?? 0, y: cardLayout?.y ?? 0 },
      data: {
        cardId: card.id,
        title: card.title,
        aliasOf,
        active,
        activeRouteId,
        emphasis,
        sourceHandles: resolveHandles(handles.sourceHandles, colors, cardLayout, nodeHeight),
        targetHandles: resolveHandles(handles.targetHandles, colors, cardLayout, nodeHeight),
      },
      className: active ? 'rf-card-node rf-card-node--active' : 'rf-card-node',
    } satisfies CardFlowNode;
  });
}

export interface ProjectRouteEdgesOptions {
  /** The route to emphasise, if any. */
  activeRouteId?: string | null;
  /** How strongly the other routes recede. */
  emphasis?: RouteEmphasis;
}

/** Map route-derived edges → colored React Flow edges connected port-to-port. */
export function projectRouteEdges(
  routeEdges: readonly RouteEdge[],
  colors: ColorByRouteId,
  options: ProjectRouteEdgesOptions = {},
): Edge[] {
  const activeRouteId = options.activeRouteId ?? null;
  const emphasis = options.emphasis ?? 'equal';

  return routeEdges.map((edge) => {
    const color = colors[edge.routeId] ?? FALLBACK_COLOR;
    const isActiveRoute = edge.routeId === activeRouteId;
    const emphasized = isActiveRoute || emphasis === 'equal';

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
        opacity: emphasized ? 1 : OTHER_ROUTE_OPACITY[emphasis],
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      data: { routeId: edge.routeId },
    };
  });
}
