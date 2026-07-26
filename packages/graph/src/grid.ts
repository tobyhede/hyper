import type { LayoutGraph, LayoutStrategy } from './layout';

/**
 * A grid: cards in reading order, left to right and wrapping down.
 *
 * The second strategy, and the one that makes the seam real. It consumes only
 * the cards — never the edges, never the routes — and it places no ports,
 * leaving their offsets undefined for the render layer to spread evenly. That —
 * placing no ports, ignoring the edges — is what keeps the seam honest, not any
 * ELK specifics. The arithmetic is synchronous but the function is `async`, so
 * it satisfies the uniformly-async `LayoutStrategy` contract (layout-seam/06).
 *
 * Automatic: it computes placement from the cards alone, so no Layout stands
 * behind it. That does not make a view of it read-only — editing one is legal
 * and **converts** it, copying this arrangement into the Layout the edit is
 * written to (ADR 0025).
 */

export interface GridStrategyOptions {
  /** Defaults to a square-ish grid: `ceil(sqrt(cardCount))`. */
  columns?: number;
  /** Space between cards, both axes. */
  gap?: number;
}

const DEFAULT_GAP = 80;

export function gridStrategy(options: GridStrategyOptions = {}): LayoutStrategy {
  const gap = options.gap ?? DEFAULT_GAP;

  // The contract is uniformly async by design (ADR 0005); gridStrategy has
  // nothing to await but must still return a Promise to honour the seam.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (graph: LayoutGraph): Promise<LayoutGraph> => {
    const count = graph.cards.length;
    if (count === 0) return { cards: [], edges: graph.edges };

    const columns = Math.max(1, options.columns ?? Math.ceil(Math.sqrt(count)));

    // A uniform cell, so rows line up even when cards differ in size.
    const cellWidth = Math.max(...graph.cards.map((c) => c.width));
    const cellHeight = Math.max(...graph.cards.map((c) => c.height));

    return {
      cards: graph.cards.map((card, index) => ({
        ...card,
        x: (index % columns) * (cellWidth + gap),
        y: Math.floor(index / columns) * (cellHeight + gap),
      })),
      edges: graph.edges,
    };
  };
}
