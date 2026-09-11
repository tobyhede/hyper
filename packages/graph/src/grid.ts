import type { LayoutStrategyGraph, LayoutStrategy } from './layout';

/**
 * A grid: things in reading order, left to right and wrapping down.
 *
 * The second strategy, and the one that makes the seam real. It consumes only
 * the things — never the edges, never the graphs — and it places no ports,
 * leaving their offsets undefined for the render layer to spread evenly. That —
 * placing no ports, ignoring the edges — is what keeps the seam honest, not any
 * ELK specifics. The arithmetic is synchronous but the function is `async`, so
 * it satisfies the uniformly-async `LayoutStrategy` contract (layout-seam/06).
 *
 * Automatic: it computes placement from the things alone, so no Diagram stands
 * behind it. That does not make a view of it read-only — editing one is legal
 * and **converts** it, copying this placement into the Diagram the edit is
 * written to (ADR 0025).
 */

export interface GridStrategyOptions {
  /** Defaults to a square-ish grid: `ceil(sqrt(thingCount))`. */
  columns?: number;
  /** Space between things, both axes. */
  gap?: number;
}

const DEFAULT_GAP = 80;

export function gridStrategy(options: GridStrategyOptions = {}): LayoutStrategy {
  const gap = options.gap ?? DEFAULT_GAP;

  // The contract is uniformly async by design (ADR 0005); gridStrategy has
  // nothing to await but must still return a Promise to honour the seam.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (strategyGraph: LayoutStrategyGraph): Promise<LayoutStrategyGraph> => {
    const count = strategyGraph.things.length;
    if (count === 0) return { things: [], edges: strategyGraph.edges };

    const columns = Math.max(1, options.columns ?? Math.ceil(Math.sqrt(count)));

    // A uniform cell, so rows line up even when things differ in size.
    const cellWidth = Math.max(...strategyGraph.things.map((t) => t.width));
    const cellHeight = Math.max(...strategyGraph.things.map((t) => t.height));

    return {
      things: strategyGraph.things.map((thing, index) => ({
        ...thing,
        x: (index % columns) * (cellWidth + gap),
        y: Math.floor(index / columns) * (cellHeight + gap),
      })),
      edges: strategyGraph.edges,
    };
  };
}
