import type { LayoutStrategyGraph, LayoutStrategy } from './layout';

/**
 * A grid: resources in reading order, left to right and wrapping down.
 *
 * The second strategy, and the one that makes the seam real. It consumes only
 * the resources — never the edges, never the graphs — and it answers positions,
 * which is the whole of what the contract carries (ADR 0086). Ignoring the edges
 * is what keeps the seam honest, not any one engine's specifics. The arithmetic
 * is synchronous but the function is `async`, so it satisfies the
 * uniformly-async `LayoutStrategy` contract (layout-seam/06).
 *
 * Automatic: it computes placement from the resources alone, so no Map stands
 * behind it. That does not make a view of it read-only — editing one is legal
 * and **converts** it, copying this placement into the Map the edit is
 * written to (ADR 0025).
 */

export interface GridStrategyOptions {
  /** Defaults to a square-ish grid: `ceil(sqrt(resourceCount))`. */
  columns?: number;
  /** Space between resources, both axes. */
  gap?: number;
}

const DEFAULT_GAP = 80;

export function gridStrategy(options: GridStrategyOptions = {}): LayoutStrategy {
  const gap = options.gap ?? DEFAULT_GAP;

  // The contract is uniformly async by design (ADR 0005); gridStrategy has
  // nothing to await but must still return a Promise to honour the seam.
  // eslint-disable-next-line @typescript-eslint/require-await
  return async (strategyGraph: LayoutStrategyGraph): Promise<LayoutStrategyGraph> => {
    const count = strategyGraph.resources.length;
    if (count === 0) return { resources: [], edges: strategyGraph.edges };

    const columns = Math.max(1, options.columns ?? Math.ceil(Math.sqrt(count)));

    // A uniform cell, so rows line up even when resources differ in size.
    const cellWidth = Math.max(...strategyGraph.resources.map((r) => r.width));
    const cellHeight = Math.max(...strategyGraph.resources.map((r) => r.height));

    return {
      resources: strategyGraph.resources.map((resource, index) => ({
        ...resource,
        x: (index % columns) * (cellWidth + gap),
        y: Math.floor(index / columns) * (cellHeight + gap),
      })),
      edges: strategyGraph.edges,
    };
  };
}
