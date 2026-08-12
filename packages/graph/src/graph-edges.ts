import type { GraphEdge } from '@project/core';

/**
 * What a Graph's own Edges say about each other.
 *
 * A Graph *is* a set of Edges the author draws (ADR 0032): cycles and self-Edges
 * are legal structure, and the one thing that is not is the exact same pair
 * twice in one Graph. That rule is asked in two places — intake refuses a
 * document holding it, and ADR 0045's conversion boundary refuses a View that
 * returns it — and it is computed here so the two cannot come to disagree about
 * what "the same Edge" means while each keeps its own way of saying so.
 */

/**
 * The index of every Edge repeating one earlier in the same Graph, mapped to the
 * index that earlier Edge sits at.
 *
 * Every repeat names the **first** occurrence rather than the one before it, so
 * a diagnostic built from this sends an author to the original rather than to
 * another copy of the problem. Direction is part of the identity: `A → B` and
 * `B → A` are two Edges, and a Graph may hold both.
 *
 * Indices rather than Edge values, because both callers report position — one in
 * a load error naming where the repeat and its original sit, the other in the
 * refusal it throws at the View that produced it.
 */
export function repeatedGraphEdges(edges: readonly GraphEdge[]): ReadonlyMap<number, number> {
  const firstIndex = new Map<string, number>();
  const repeats = new Map<number, number>();
  edges.forEach((edge, index) => {
    // NUL-separated, so no pair of ids can spell another pair's key.
    const key = `${edge.from}\0${edge.to}`;
    const first = firstIndex.get(key);
    if (first === undefined) {
      firstIndex.set(key, index);
      return;
    }
    repeats.set(index, first);
  });
  return repeats;
}
