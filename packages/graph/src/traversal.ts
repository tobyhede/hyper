import type { Route, RouteEdge } from '@project/core';

/**
 * Reading a route as something to walk (ADR 0024, 0027).
 *
 * Presenting traverses a route: at a card, the presenter follows one of its
 * outgoing edges. These are the reads that supports — what a card's moves are,
 * and where a walk can begin. Nothing here holds a position; the walk itself is
 * state and lives with whoever is walking.
 *
 * **A line is not a special case.** A route where every card has one outgoing
 * edge walks with a one-member choice at each step, which is what "advance" is.
 * Nothing here tests whether a route is linear and nothing should.
 */

/** The edges leaving a card, in the order the author wrote them. A card's moves. */
export function outgoingEdges(route: Route, cardId: string): RouteEdge[] {
  return route.edges.filter((edge) => edge.from === cardId);
}

/** The edges arriving at a card. */
export function incomingEdges(route: Route, cardId: string): RouteEdge[] {
  return route.edges.filter((edge) => edge.to === cardId);
}

/**
 * The cards a walk can start from: those an edge leaves but none arrives at, in
 * the order the author's edges first mention them.
 *
 * A route is acyclic (ADR 0023) and carries at least one edge, so there is
 * always at least one — following edges backwards from anywhere has to stop.
 * There may be several: a route need not be connected, and nothing requires a
 * single entry.
 */
export function routeEntryCards(route: Route): string[] {
  const arrivedAt = new Set(route.edges.map((edge) => edge.to));
  const entries: string[] = [];
  for (const edge of route.edges) {
    if (!arrivedAt.has(edge.from) && !entries.includes(edge.from)) entries.push(edge.from);
  }
  return entries;
}

/**
 * Where a walk of this route begins: the first entry card. `undefined` only for
 * a route with no edges, which the schema does not permit.
 *
 * Which entry is a policy choice and this is the plain one — the same shape as
 * ADR 0026's "absent an `activeRoute`, the first visible route". If a route ever
 * wants to name its own start, that is a field on the route and a change here.
 */
export function routeStartCard(route: Route): string | undefined {
  return routeEntryCards(route)[0];
}
