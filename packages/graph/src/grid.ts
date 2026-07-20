import type { Layout, LayoutGraph } from './layout';

/**
 * A grid layout: cards in reading order, left to right and wrapping down.
 *
 * The second Layout, and the one that makes the seam real. It consumes only the
 * cards — never the edges, never the routes — and it places no ports, leaving
 * their offsets undefined for the render layer to spread evenly. It is also
 * synchronous, which is what proves a layout need not be asynchronous.
 */

export interface GridLayoutOptions {
  /** Defaults to a square-ish grid: `ceil(sqrt(cardCount))`. */
  columns?: number;
  /** Space between cards, both axes. */
  gap?: number;
}

const DEFAULT_GAP = 80;

export function gridLayout(options: GridLayoutOptions = {}): Layout {
  const gap = options.gap ?? DEFAULT_GAP;

  return (graph: LayoutGraph): LayoutGraph => {
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
