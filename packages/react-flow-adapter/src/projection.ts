import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { CardId, RouteId } from '@project/core';
import { resolveContentCard } from '@project/graph';
import type {
  CardHandleSet,
  LayoutCard,
  LayoutEdge,
  LayoutGraph,
  LayoutPoint,
  GraphEdge,
  RouteHandleRef,
  Space,
} from '@project/graph';
import type { RoutedEdgeData } from './RoutedEdge';

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
  routeId: RouteId;
  color: string;
  offsetY: number;
};

/** Data carried by each custom card node. Kept as a type alias so it satisfies
 *  React Flow's `Record<string, unknown>` data constraint, and it includes the
 *  handle arrays the ELK layout needs. */
export type CardNodeData = {
  cardId: CardId;
  title: string;
  /** A short caption drawn under the title (ADR 0006). Absent when the card has
   *  none — the card's own, never inherited through an alias. */
  description?: string;
  /** For an alias, the title of the card it shows — so the node can name what it
   *  redraws. Absent on non-alias cards. */
  aliasOf?: string;
  active: boolean;
  /**
   * Draw the card's content rather than its title. ADR 0006 deferred a "show
   * full content" view and left it a View's choice; presenting is that view (ADR
   * 0027). Set on the active card alone, never on the whole graph.
   */
  showContent: boolean;
  /** The Markdown to draw when `showContent`, resolved through an alias to its
   *  target's body. Absent otherwise — content is not embedded in every node
   *  (ADR 0006), which is the constraint that made this per-card. */
  body?: string;
  /** The route being emphasised, if any. Drives handle dimming. */
  activeRouteId: RouteId | null;
  emphasis: RouteEmphasis;
  sourceHandles: CardHandle[];
  targetHandles: CardHandle[];
};

export type CardFlowNode = Node<CardNodeData, 'card'>;

export type ColorByRouteId = Readonly<Partial<Record<RouteId, string>>>;

const EMPTY_HANDLES: CardHandleSet = { sourceHandles: [], targetHandles: [] };

export interface ProjectCardNodesOptions {
  /** Card id the walk has reached, if any, to flag as active. */
  activeCardId?: CardId | null;
  /**
   * Draw the active card's content instead of its title — what presenting does
   * (ADR 0027). Only the active card is affected, so this costs one card's body
   * in the projection rather than every card's.
   */
  showActiveCardContent?: boolean;
  /** The route to emphasise, if any. */
  activeRouteId?: RouteId | null;
  emphasis?: RouteEmphasis;
  /** The laid-out graph; positions and port offsets come from here when present. */
  layoutGraph?: LayoutGraph;
  /** Node height used to evenly distribute handles before the layout resolves. */
  nodeHeight?: number;
  /** Restrict the projection to these card ids (e.g. one route's cards). */
  cardIds?: readonly CardId[];
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
  handlesByCard: ReadonlyMap<CardId, CardHandleSet>,
  colors: ColorByRouteId,
  options: ProjectCardNodesOptions = {},
): CardFlowNode[] {
  const activeCardId = options.activeCardId ?? null;
  const showActiveCardContent = options.showActiveCardContent ?? false;
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
    const showContent = active && showActiveCardContent;
    // An alias names the card it redraws; a markdown card names nothing (ADR 0009).
    const aliasOf = card.kind === 'alias' ? resolveContentCard(space, card.id)?.title : undefined;
    // An alias shows its target's content under its own title (ADR 0009).
    const body = showContent ? (resolveContentCard(space, card.id)?.body ?? '') : undefined;

    return {
      id: card.id,
      type: 'card',
      position: { x: cardLayout?.x ?? 0, y: cardLayout?.y ?? 0 },
      // Carry the layout's dimensions through when it has placed the card. ELK
      // (and the grid) work at a fixed `CARD_SIZE`, so declaring width/height
      // here means React Flow renders the node at exactly the size the layout
      // reasoned about — no measure-then-reflow, and a centred `nodeOrigin` (if a
      // view chooses one) resolves correctly on first paint. Absent before the
      // layout resolves, so React Flow falls back to measuring, as before.
      ...(cardLayout ? { width: cardLayout.width, height: cardLayout.height } : {}),
      data: {
        cardId: card.id,
        title: card.title,
        // The card's own description, drawn under the title (ADR 0006). Omit when
        // absent; never inherited through an alias.
        ...(card.description !== undefined ? { description: card.description } : {}),
        // Omit rather than set undefined: absent means "not an alias" (ADR 0009).
        ...(aliasOf !== undefined ? { aliasOf } : {}),
        active,
        showContent,
        ...(body !== undefined ? { body } : {}),
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
  activeRouteId?: RouteId | null;
  /** How strongly the other routes recede. */
  emphasis?: RouteEmphasis;
  /** The laid-out graph; ELK's routed edge geometry comes from here when present. */
  layoutGraph?: LayoutGraph;
}

/** Flatten an edge's routed sections into one point list: start → bends → end. */
function routedPoints(edge: LayoutEdge | undefined): LayoutPoint[] | undefined {
  if (!edge?.sections?.length) return undefined;
  const points: LayoutPoint[] = [];
  for (const section of edge.sections) {
    points.push(section.startPoint, ...(section.bendPoints ?? []), section.endPoint);
  }
  return points;
}

/** Map route-derived edges → colored React Flow edges drawn along ELK's routing. */
export function projectRouteEdges(
  routeEdges: readonly GraphEdge[],
  colors: ColorByRouteId,
  options: ProjectRouteEdgesOptions = {},
): Edge[] {
  const activeRouteId = options.activeRouteId ?? null;
  const emphasis = options.emphasis ?? 'equal';
  const laidEdges = new Map((options.layoutGraph?.edges ?? []).map((e) => [e.id, e]));

  return routeEdges.map((edge) => {
    const color = colors[edge.routeId] ?? FALLBACK_COLOR;
    const isActiveRoute = edge.routeId === activeRouteId;
    const emphasized = isActiveRoute || emphasis === 'equal';
    const points = routedPoints(laidEdges.get(edge.id));

    return {
      id: edge.id,
      // A custom edge that draws ELK's routed polyline (issue 03); it falls back
      // to a bezier between the handles when no routing has been placed yet.
      type: 'routed',
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      className: `rf-route-edge rf-route-edge--${edge.routeId}`,
      animated: emphasized,
      style: {
        stroke: color,
        strokeWidth: isActiveRoute ? 3 : 2,
        opacity: emphasized ? 1 : OTHER_ROUTE_OPACITY[emphasis],
      },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      data: {
        routeId: edge.routeId,
        ...(points !== undefined ? { points } : {}),
      } satisfies RoutedEdgeData,
    };
  });
}
