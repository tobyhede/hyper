import { useEffect, useMemo, useState } from 'react';
import {
  positionedStrategy,
  type LayoutStrategyGraph,
  type LayoutStrategy,
  type Placement,
} from '@project/graph';

export type PlacementRenderingState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'ready'; readonly strategyGraph: LayoutStrategyGraph }
  | { readonly kind: 'failed'; readonly error: Error };

interface PlacementRenderingResult {
  readonly input: LayoutStrategyGraph;
  readonly strategy: LayoutStrategy;
  readonly state: Exclude<PlacementRenderingState, { readonly kind: 'pending' }>;
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Resolve a Diagram's positioned strategy over its own placement.
 *
 * `placement` is the one source of geometry — the selected Diagram's own
 * positions, or a resize draft's rect layered over them — and the positioned
 * strategy is built from it here rather than taken as a second argument: a
 * caller that also built one from the same placement could only agree with
 * this or be stale. Keyed on `placement`'s identity, which every caller
 * memoises on the selected Diagram, so an ordinary drag frame — which moves
 * nothing in the working snapshot until it settles — does not rebuild the
 * strategy and does not re-run layout.
 */
export function usePlacementRendering(
  strategyGraph: LayoutStrategyGraph,
  placement: Placement,
): PlacementRenderingState {
  const [result, setResult] = useState<PlacementRenderingResult | null>(null);
  const strategy = useMemo(() => positionedStrategy(placement), [placement]);

  useEffect(() => {
    let current = true;
    void Promise.resolve()
      .then(() => strategy(strategyGraph))
      .then((placed) => {
        if (current) {
          setResult({
            input: strategyGraph,
            strategy,
            state: { kind: 'ready', strategyGraph: placed },
          });
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setResult({
            input: strategyGraph,
            strategy,
            state: { kind: 'failed', error: toError(reason) },
          });
        }
      });
    return () => {
      current = false;
    };
  }, [strategyGraph, strategy]);

  return result?.input === strategyGraph && result.strategy === strategy
    ? result.state
    : { kind: 'pending' };
}
