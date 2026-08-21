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

export function usePlacementRendering(
  strategyGraph: LayoutStrategyGraph,
  strategy: LayoutStrategy,
  authoredPlacement: Placement | null,
): PlacementRenderingState {
  const [result, setResult] = useState<PlacementRenderingResult | null>(null);
  // Split from the fallback so authored placement does not depend on `strategy`:
  // a new automatic strategy identity would otherwise rebuild the positioned one
  // and re-run layout, discarding a settled authored render for an identical result.
  //
  // Keyed on the Placement's identity, which Space Authoring keeps stable while
  // the value is unchanged — so a projection reporting the geometry already on
  // screen does not re-run layout over a settled render.
  const authoredStrategy = useMemo<LayoutStrategy | null>(
    () => (authoredPlacement === null ? null : positionedStrategy(authoredPlacement)),
    [authoredPlacement],
  );
  const renderingStrategy = authoredStrategy ?? strategy;

  useEffect(() => {
    let current = true;
    void Promise.resolve()
      .then(() => renderingStrategy(strategyGraph))
      .then((placed) => {
        if (current) {
          setResult({
            input: strategyGraph,
            strategy: renderingStrategy,
            state: { kind: 'ready', strategyGraph: placed },
          });
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setResult({
            input: strategyGraph,
            strategy: renderingStrategy,
            state: { kind: 'failed', error: toError(reason) },
          });
        }
      });
    return () => {
      current = false;
    };
  }, [strategyGraph, renderingStrategy]);

  return result?.input === strategyGraph && result.strategy === renderingStrategy
    ? result.state
    : { kind: 'pending' };
}
