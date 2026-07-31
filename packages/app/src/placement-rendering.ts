import { useEffect, useMemo, useState } from 'react';
import { uuidSchema, type CardId } from '@project/core';
import {
  positionedStrategy,
  type LayoutGraph,
  type LayoutPoint,
  type LayoutStrategy,
} from '@project/graph';

type PlacementRenderingState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'ready'; readonly graph: LayoutGraph }
  | { readonly kind: 'failed'; readonly error: Error };

interface PlacementRenderingResult {
  readonly input: LayoutGraph;
  readonly strategy: LayoutStrategy;
  readonly state: Exclude<PlacementRenderingState, { readonly kind: 'pending' }>;
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

export function usePlacementRendering(
  graph: LayoutGraph,
  strategy: LayoutStrategy,
  authoredPositions: ReadonlyMap<string, LayoutPoint> | null,
): PlacementRenderingState {
  const [result, setResult] = useState<PlacementRenderingResult | null>(null);
  const renderingStrategy = useMemo(() => {
    if (authoredPositions === null) return strategy;
    const positions = new Map<CardId, LayoutPoint>();
    for (const [cardId, point] of authoredPositions) {
      positions.set(uuidSchema.parse(cardId), point);
    }
    return positionedStrategy(positions);
  }, [strategy, authoredPositions]);

  useEffect(() => {
    let current = true;
    void Promise.resolve()
      .then(() => renderingStrategy(graph))
      .then((placed) => {
        if (current) {
          setResult({
            input: graph,
            strategy: renderingStrategy,
            state: { kind: 'ready', graph: placed },
          });
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setResult({
            input: graph,
            strategy: renderingStrategy,
            state: { kind: 'failed', error: toError(reason) },
          });
        }
      });
    return () => {
      current = false;
    };
  }, [graph, renderingStrategy]);

  return result?.input === graph && result.strategy === renderingStrategy
    ? result.state
    : { kind: 'pending' };
}
