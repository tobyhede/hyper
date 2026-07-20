import type { Manifest } from '@project/core';

/**
 * Derives the graph's ports and connections from its presentation routes.
 *
 * The model: every route that steps through a card gives that card one inbound
 * port (`<routeId>::in`, on the left) and one outbound port (`<routeId>::out`, on
 * the right). Consecutive steps become a port-to-port edge belonging to that
 * route. This is what lets each route render as its own colored line through the graph
 * and drives the ELK multiple-handles layout.
 */

export interface RouteHandleRef {
  /** Handle id, also used as the ELK port id. */
  id: string;
  routeId: string;
}

export interface CardHandleSet {
  /** Outbound ports (right / EAST). */
  sourceHandles: RouteHandleRef[];
  /** Inbound ports (left / WEST). */
  targetHandles: RouteHandleRef[];
}

export interface RouteEdge {
  id: string;
  routeId: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  /** Index of the originating step within the route. */
  stepIndex: number;
}

export const outHandleId = (routeId: string): string => `${routeId}::out`;
export const inHandleId = (routeId: string): string => `${routeId}::in`;

/** Map each card id to the in/out ports contributed by the routes through it. */
export function buildCardHandles(manifest: Manifest): Map<string, CardHandleSet> {
  const map = new Map<string, CardHandleSet>();
  const ensure = (cardId: string): CardHandleSet => {
    let set = map.get(cardId);
    if (!set) {
      set = { sourceHandles: [], targetHandles: [] };
      map.set(cardId, set);
    }
    return set;
  };

  for (const route of manifest.routes) {
    route.steps.forEach((step, index) => {
      const set = ensure(step.target);
      const isFirst = index === 0;
      const isLast = index === route.steps.length - 1;

      if (!isLast) {
        const id = outHandleId(route.id);
        if (!set.sourceHandles.some((h) => h.id === id)) {
          set.sourceHandles.push({ id, routeId: route.id });
        }
      }
      if (!isFirst) {
        const id = inHandleId(route.id);
        if (!set.targetHandles.some((h) => h.id === id)) {
          set.targetHandles.push({ id, routeId: route.id });
        }
      }
    });
  }

  return map;
}

/**
 * The distinct card ids the given routes visit, in first-visit order — routes in
 * the order supplied, steps in order within each.
 *
 * A card shared by several routes appears once. Which routes a view shows is the
 * view's decision (ADR 0005); this only answers what cards that implies.
 */
export function cardIdsForRoutes(manifest: Manifest, routeIds: readonly string[]): string[] {
  const wanted = new Set(routeIds);
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const routeId of routeIds) {
    const route = manifest.routes.find((r) => r.id === routeId);
    if (!route || !wanted.has(route.id)) continue;
    for (const step of route.steps) {
      if (!seen.has(step.target)) {
        seen.add(step.target);
        ids.push(step.target);
      }
    }
  }

  return ids;
}

/** The distinct card ids a single route visits, in first-visit order. */
export function routeCardIds(manifest: Manifest, routeId: string): string[] {
  return cardIdsForRoutes(manifest, [routeId]);
}

/** Keep only the handles belonging to the given routes. */
export function filterHandlesByRoutes(
  handlesByCard: ReadonlyMap<string, CardHandleSet>,
  routeIds: readonly string[],
): Map<string, CardHandleSet> {
  const wanted = new Set(routeIds);
  const filtered = new Map<string, CardHandleSet>();
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
  handlesByCard: ReadonlyMap<string, CardHandleSet>,
  routeId: string,
): Map<string, CardHandleSet> {
  return filterHandlesByRoutes(handlesByCard, [routeId]);
}

/** Build the colored port-to-port edges implied by each route's step order. */
export function buildRouteEdges(manifest: Manifest): RouteEdge[] {
  const edges: RouteEdge[] = [];

  for (const route of manifest.routes) {
    for (let i = 0; i < route.steps.length - 1; i += 1) {
      const from = route.steps[i];
      const to = route.steps[i + 1];
      if (!from || !to) continue;
      edges.push({
        id: `${route.id}::${i}`,
        routeId: route.id,
        source: from.target,
        target: to.target,
        sourceHandle: outHandleId(route.id),
        targetHandle: inHandleId(route.id),
        stepIndex: i,
      });
    }
  }

  return edges;
}
