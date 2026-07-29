import type { CardId, RouteId } from '@project/core';
import type { Space } from './space';

/**
 * Derives the graph's ports and connections from its routes.
 *
 * The model: a card that a route leaves gets one outbound port
 * (`<routeId>::out`, on the right), a card a route arrives at gets one inbound
 * port (`<routeId>::in`, on the left), and each authored `{ from, to }` edge
 * becomes a port-to-port connection belonging to that route. One port per route
 * per side, however many edges use it — a fork leaves a card by the same
 * outbound port twice.
 *
 * This is what lets each route render as its own colored line through the graph
 * and drives the ELK multiple-handles layout. It belongs to the **overview** —
 * the view that draws every route at once and needs distinct attachment points
 * to stay legible (ADR 0021) — not to the domain.
 */

export interface RouteHandleRef {
  /** Handle id, also used as the ELK port id. */
  id: string;
  routeId: RouteId;
}

export interface CardHandleSet {
  /** Outbound ports (right / EAST). */
  sourceHandles: RouteHandleRef[];
  /** Inbound ports (left / WEST). */
  targetHandles: RouteHandleRef[];
}

/**
 * A route's edge as the graph draws it: the authored `{ from, to }` (`@project/core`'s
 * `RouteEdge`) resolved onto the ports it attaches to, and tagged with the route
 * it belongs to so the render layer can colour it. `buildLayoutGraph` narrows
 * this to a `LayoutEdge`, which is the same thing again once geometry lands on
 * it.
 */
export interface GraphEdge {
  id: string;
  routeId: RouteId;
  source: CardId;
  target: CardId;
  sourceHandle: string;
  targetHandle: string;
}

export const outHandleId = (routeId: RouteId): string => `${routeId}::out`;
export const inHandleId = (routeId: RouteId): string => `${routeId}::in`;

/** Map each card id to the in/out ports contributed by the routes through it. */
export function buildCardHandles(space: Space): Map<CardId, CardHandleSet> {
  const map = new Map<CardId, CardHandleSet>();
  const ensure = (cardId: CardId): CardHandleSet => {
    let set = map.get(cardId);
    if (!set) {
      set = { sourceHandles: [], targetHandles: [] };
      map.set(cardId, set);
    }
    return set;
  };

  // A card gets an outbound port because an edge leaves it and an inbound one
  // because an edge arrives — read off the edges directly rather than from a
  // card's position in a list, so a fork's several outgoing edges share one
  // port and a route's sinks get no outbound port because nothing leaves them.
  for (const route of space.routes) {
    for (const edge of route.edges) {
      const outId = outHandleId(route.id);
      const source = ensure(edge.from);
      if (!source.sourceHandles.some((h) => h.id === outId)) {
        source.sourceHandles.push({ id: outId, routeId: route.id });
      }

      const inId = inHandleId(route.id);
      const target = ensure(edge.to);
      if (!target.targetHandles.some((h) => h.id === inId)) {
        target.targetHandles.push({ id: inId, routeId: route.id });
      }
    }
  }

  return map;
}

/**
 * The distinct cards the given routes touch — routes in the order supplied,
 * edges in authored order within each, and each edge's `from` before its `to`.
 *
 * A membership query, not a walk: it answers *which* cards, and the order is
 * only a stable one to list them in. A route is a graph, so there is no single
 * order to visit them in and this does not claim one.
 *
 * A card shared by several routes appears once. Which routes a view shows is the
 * view's decision (ADR 0005); this only answers what cards that implies.
 */
export function cardIdsForRoutes(space: Space, routeIds: readonly RouteId[]): CardId[] {
  const seen = new Set<CardId>();
  const ids: CardId[] = [];
  const add = (cardId: CardId): void => {
    if (seen.has(cardId)) return;
    seen.add(cardId);
    ids.push(cardId);
  };

  for (const routeId of routeIds) {
    const route = space.routesById.get(routeId);
    if (!route) continue;
    for (const edge of route.edges) {
      add(edge.from);
      add(edge.to);
    }
  }

  return ids;
}

/** The distinct cards a single route touches. See {@link cardIdsForRoutes}. */
export function routeCardIds(space: Space, routeId: RouteId): CardId[] {
  return cardIdsForRoutes(space, [routeId]);
}

/** Keep only the handles belonging to the given routes. */
export function filterHandlesByRoutes(
  handlesByCard: ReadonlyMap<CardId, CardHandleSet>,
  routeIds: readonly RouteId[],
): Map<CardId, CardHandleSet> {
  const wanted = new Set(routeIds);
  const filtered = new Map<CardId, CardHandleSet>();
  for (const [cardId, set] of handlesByCard) {
    const sourceHandles = set.sourceHandles.filter((h) => wanted.has(h.routeId));
    const targetHandles = set.targetHandles.filter((h) => wanted.has(h.routeId));
    if (sourceHandles.length || targetHandles.length) {
      filtered.set(cardId, { sourceHandles, targetHandles });
    }
  }
  return filtered;
}

/** Keep only the handles belonging to a single route. */
export function filterHandlesByRoute(
  handlesByCard: ReadonlyMap<CardId, CardHandleSet>,
  routeId: RouteId,
): Map<CardId, CardHandleSet> {
  return filterHandlesByRoutes(handlesByCard, [routeId]);
}

/**
 * Resolve every route's authored edges onto the ports they attach to.
 *
 * One edge in, one edge out: the route already *is* its connections, so nothing
 * here derives them from an order. The id is keyed on the edge's position in its
 * route because that stays unique even if a route were to carry the same pair
 * twice.
 */
export function buildRouteEdges(space: Space): GraphEdge[] {
  const edges: GraphEdge[] = [];

  for (const route of space.routes) {
    route.edges.forEach((edge, index) => {
      edges.push({
        id: `${route.id}::${index}`,
        routeId: route.id,
        source: edge.from,
        target: edge.to,
        sourceHandle: outHandleId(route.id),
        targetHandle: inHandleId(route.id),
      });
    });
  }

  return edges;
}
