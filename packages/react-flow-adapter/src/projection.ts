import type { Edge, Node, NodeHandle } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';
import type { CardId, LayoutPosition, RouteId } from '@project/core';
import { resolveContentCard } from '@project/graph';
import type {
  CardHandleSet,
  LayoutCard,
  LayoutEdge,
  LayoutGraph,
  GraphEdge,
  RouteHandleRef,
  Space,
} from '@project/graph';
import type { RoutedEdgeData } from './RoutedEdge';
import { AUTHORING_HANDLE_DIAMETER, ROUTE_PORT_DIAMETER } from './authoring-handle';

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
  /** Local Card-authoring controls supplied by the application composition. */
  titleEditingEnabled?: boolean;
  /** Whether this Card owns content to edit — an Alias does not. */
  cardEditingEnabled?: boolean;
  editingTitle?: boolean;
  onEditCard?: () => void;
  onBeginTitleEditing?: () => void;
  onCompleteTitleEditing?: (title: string) => string | null;
  onCancelTitleEditing?: () => void;
  /** A short caption drawn under the title (ADR 0006). Absent when the card has
   *  none — the card's own, never inherited through an alias. */
  description?: string;
  /** For an alias, the title of the card it shows — so the node can name what it
   *  redraws. Absent on non-alias cards. */
  aliasOf?: string;
  active: boolean;
  /** Ordinary renderer selection, kept outside the authored Space. */
  selectedForAuthoring: boolean;
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
  /** The active Route's colour, used by route-independent authoring handles. */
  activeRouteColor: string;
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
  /** Ordinary renderer selection used to expose continued-authoring handles. */
  selectedCardId?: CardId | null;
  /**
   * Draw the active card's content instead of its title — what presenting does
   * (ADR 0027). Only the active card is affected, so this costs one card's body
   * in the projection rather than every card's.
   */
  showActiveCardContent?: boolean;
  /** The route to emphasise, if any. */
  activeRouteId?: RouteId | null;
  /** The active Route's resolved colour for route authoring controls. */
  activeRouteColor?: string;
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

function declaredHandles(
  sourceHandles: readonly CardHandle[],
  targetHandles: readonly CardHandle[],
  routeIds: readonly RouteId[],
  card: LayoutCard,
): NodeHandle[] {
  const radius = AUTHORING_HANDLE_DIAMETER / 2;
  const portRadius = ROUTE_PORT_DIAMETER / 2;
  const authoring = (
    type: 'source' | 'target',
    side: Position,
    x: number,
    y: number,
  ): NodeHandle => ({
    id: `authoring-${type}-${side}`,
    type,
    position: side,
    x,
    y,
    width: AUTHORING_HANDLE_DIAMETER,
    height: AUTHORING_HANDLE_DIAMETER,
  });
  const targetByRoute = new Map(targetHandles.map((handle) => [handle.routeId, handle]));
  const sourceByRoute = new Map(sourceHandles.map((handle) => [handle.routeId, handle]));
  const fallbackOffset = (index: number) => ((index + 1) / (routeIds.length + 1)) * card.height;
  // The DOM renders only incident overview anchors. Declaring every existing
  // Route id keeps a completed connection resolvable in the same render that
  // first makes its target incident, without exposing another visible control.
  //
  // This is also why nothing may force a React Flow remeasure of a placed Card:
  // `parseHandles` prefers what is declared here, but a forced update rebuilds
  // the bounds from `getHandleBounds`, which sees only the anchors the DOM draws
  // — and the not-yet-incident declarations, the whole point of the loop below,
  // are gone. `CardNode` records the same rule from the other side.
  //
  // Order matters, and the authoring handles come first. React Flow picks the
  // closest declared handle within its connection radius and resolves an exact
  // distance tie by array order. A non-incident anchor's fallback offset can land
  // exactly on an authoring handle — with one Route it always does, since the
  // lone anchor sits at half the Card's height and so do the Left and Right
  // handles. The authoring handle is the one with a DOM element behind it, and a
  // release that resolves to an anchor with none is refused, so the tie has to
  // fall the other way.
  return [
    authoring('source', Position.Top, card.width / 2 - radius, -radius),
    authoring('source', Position.Right, card.width - radius, card.height / 2 - radius),
    authoring('source', Position.Bottom, card.width / 2 - radius, card.height - radius),
    authoring('source', Position.Left, -radius, card.height / 2 - radius),
    authoring('target', Position.Top, card.width / 2 - radius, -radius),
    authoring('target', Position.Right, card.width - radius, card.height / 2 - radius),
    authoring('target', Position.Bottom, card.width / 2 - radius, card.height - radius),
    authoring('target', Position.Left, -radius, card.height / 2 - radius),
    ...routeIds.map((routeId, index): NodeHandle => {
      const handle = targetByRoute.get(routeId);
      return {
        id: handle?.id ?? `${routeId}::in`,
        type: 'target',
        position: Position.Left,
        x: -portRadius,
        y: (handle?.offsetY ?? fallbackOffset(index)) - portRadius,
        width: ROUTE_PORT_DIAMETER,
        height: ROUTE_PORT_DIAMETER,
      };
    }),
    ...routeIds.map((routeId, index): NodeHandle => {
      const handle = sourceByRoute.get(routeId);
      return {
        id: handle?.id ?? `${routeId}::out`,
        type: 'source',
        position: Position.Right,
        x: card.width - portRadius,
        y: (handle?.offsetY ?? fallbackOffset(index)) - portRadius,
        width: ROUTE_PORT_DIAMETER,
        height: ROUTE_PORT_DIAMETER,
      };
    }),
  ];
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
    const sourceHandles = resolveHandles(handles.sourceHandles, colors, cardLayout, nodeHeight);
    const targetHandles = resolveHandles(handles.targetHandles, colors, cardLayout, nodeHeight);

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
      //
      // `measured` is deliberately *not* set alongside them. React Flow documents
      // it as an output it writes after measuring, and it is redundant as an
      // input: `nodeHasDimensions` reads `measured?.width ?? width ?? initialWidth`,
      // so width/height already answer it, and a Card counts as initialized on
      // those plus its declared `handles`. What supplying it would change is that
      // React Flow preserves cached `handleBounds` instead of resetting them for
      // re-measure — a distinction with no meaning here, because the bounds come
      // from `declaredHandles` either way.
      ...(cardLayout
        ? {
            width: cardLayout.width,
            height: cardLayout.height,
          }
        : {}),
      ...(cardLayout
        ? {
            handles: declaredHandles(
              sourceHandles,
              targetHandles,
              Object.keys(colors) as RouteId[],
              cardLayout,
            ),
          }
        : {}),
      data: {
        cardId: card.id,
        title: card.title,
        // The card's own description, drawn under the title (ADR 0006). Omit when
        // absent; never inherited through an alias.
        ...(card.description !== undefined ? { description: card.description } : {}),
        // Omit rather than set undefined: absent means "not an alias" (ADR 0009).
        ...(aliasOf !== undefined ? { aliasOf } : {}),
        active,
        selectedForAuthoring: card.id === (options.selectedCardId ?? null),
        showContent,
        ...(body !== undefined ? { body } : {}),
        activeRouteId,
        activeRouteColor: options.activeRouteColor ?? FALLBACK_COLOR,
        emphasis,
        sourceHandles,
        targetHandles,
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
function routedPoints(edge: LayoutEdge | undefined): LayoutPosition[] | undefined {
  if (!edge?.sections?.length) return undefined;
  const points: LayoutPosition[] = [];
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
