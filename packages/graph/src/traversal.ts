import type { CardId, Graph, GraphEdge } from '@project/core';

/**
 * Reading a Graph as something to traverse (ADR 0024, 0027).
 *
 * Presenting traverses a Graph: at a Card, the presenter follows one of its
 * outgoing Edges. These are the reads that traversal supports — what a Card's moves are,
 * and where a traversal can begin. Nothing here holds a position; Traversal
 * history itself is state and lives with whoever is traversing.
 *
 * **A line is not a special case.** A graph where every card has one outgoing
 * edge traverses with a one-member choice at each step, which is what "advance" is.
 * Nothing here tests whether a graph is linear and nothing should.
 */

/** The edges leaving a card, in the order the author wrote them. A card's moves. */
export function outgoingEdges(graph: Graph, cardId: CardId): GraphEdge[] {
  return graph.edges.filter((edge) => edge.from === cardId);
}

/**
 * The Cards a traversal can start from: those an Edge leaves but none arrives at, in
 * the order the author's edges first mention them.
 *
 * There may be several because a graph need not be connected, or none when
 * every component is cyclic (ADR 0032). Nothing requires a single entry.
 */
export function graphEntryCards(graph: Graph): CardId[] {
  const arrivedAt = new Set(graph.edges.map((edge) => edge.to));
  const entries: CardId[] = [];
  for (const edge of graph.edges) {
    if (!arrivedAt.has(edge.from) && !entries.includes(edge.from)) entries.push(edge.from);
  }
  return entries;
}

/**
 * Where a traversal of this Graph begins. Two rules, in this order.
 *
 * **A card nothing arrives at wins**, and this rule stays first. It makes the
 * start a property of the graph's shape rather than of the order its edges were
 * drawn: connecting appends, so an author who draws `b → c` and then attaches
 * `a → b` stores the `b` edge first, and starting there would skip `a` — a card
 * forward traversal never reaches. Which entry, when there are several, is a
 * policy choice and this is the plain one — the same shape as ADR 0026's
 * "absent an `activeGraph`, the first visible graph".
 *
 * **Otherwise the first edge's `from`.** Every card of a fully cyclic graph is
 * arrived at, so rule 1 has no answer and authoring order is the only tie-break
 * left (ADR 0032). The two rules are not the same kind of answer: for a
 * self-edge rule 2 *derives* the start — one card, one edge, nothing to choose
 * — while for a multi-card cycle it *picks* one, and any card on the loop would
 * have been as defensible.
 *
 * **A start, not a reachable whole.** Every schema-valid graph gets a place to
 * begin, and nothing more: a graph of two components — `a → b` plus a disjoint
 * loop — starts at `a` under rule 1, and forward traversal never reaches the
 * loop. Whether a traversal can reach every Card of a disconnected Graph is a
 * separate question, and the fallback does not answer it.
 *
 * `undefined` is left for a graph with no edges, and that is a **normal** state
 * rather than an unreachable one: creating a layout creates its initial active
 * graph empty in the same edit (ADR 0040), so every new Layout is in it until
 * the author draws something. `graphSchema`
 * used to forbid it and no longer does. Callers must answer it — presenting
 * refuses, and the control that offers presenting is disabled — because a graph
 * with no edges has nowhere to begin, not because the type demands a branch.
 * If a graph ever wants to name its own start, that is a field on the graph and
 * a change here.
 */
export function graphStartCard(graph: Graph): CardId | undefined {
  return graphEntryCards(graph)[0] ?? graph.edges[0]?.from;
}
