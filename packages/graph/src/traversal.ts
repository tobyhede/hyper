import type { CardId, Route, RouteEdge } from '@project/core';

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
export function outgoingEdges(route: Route, cardId: CardId): RouteEdge[] {
  return route.edges.filter((edge) => edge.from === cardId);
}

/** The edges arriving at a card. */
export function incomingEdges(route: Route, cardId: CardId): RouteEdge[] {
  return route.edges.filter((edge) => edge.to === cardId);
}

/**
 * The cards a walk can start from: those an edge leaves but none arrives at, in
 * the order the author's edges first mention them.
 *
 * There may be several because a route need not be connected, or none when
 * every component is cyclic (ADR 0032). Nothing requires a single entry.
 */
export function routeEntryCards(route: Route): CardId[] {
  const arrivedAt = new Set(route.edges.map((edge) => edge.to));
  const entries: CardId[] = [];
  for (const edge of route.edges) {
    if (!arrivedAt.has(edge.from) && !entries.includes(edge.from)) entries.push(edge.from);
  }
  return entries;
}

/**
 * Where a walk of this route begins. Two rules, in this order.
 *
 * **A card nothing arrives at wins**, and this rule stays first. It makes the
 * start a property of the route's shape rather than of the order its edges were
 * drawn: connecting appends, so an author who draws `b → c` and then attaches
 * `a → b` stores the `b` edge first, and starting there would skip `a` — a card
 * forward traversal never reaches. Which entry, when there are several, is a
 * policy choice and this is the plain one — the same shape as ADR 0026's
 * "absent an `activeRoute`, the first visible route".
 *
 * **Otherwise the first edge's `from`.** Every card of a fully cyclic route is
 * arrived at, so rule 1 has no answer and authoring order is the only tie-break
 * left (ADR 0032). The two rules are not the same kind of answer: for a
 * self-edge rule 2 *derives* the start — one card, one edge, nothing to choose
 * — while for a multi-card cycle it *picks* one, and any card on the loop would
 * have been as defensible.
 *
 * `undefined` is left only for a route with no edges, which `routeSchema`
 * forbids. If a route ever wants to name its own start, that is a field on the
 * route and a change here.
 */
export function routeStartCard(route: Route): CardId | undefined {
  return routeEntryCards(route)[0] ?? route.edges[0]?.from;
}
