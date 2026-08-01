import { useEffect, useMemo, useState } from 'react';
import { uuidSchema, type CardId } from '@project/core';
import {
  positionedStrategy,
  type LayoutGraph,
  type LayoutPoint,
  type LayoutStrategy,
} from '@project/graph';

export type PlacementRenderingState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'ready'; readonly graph: LayoutGraph }
  | { readonly kind: 'failed'; readonly error: Error };

/** What the graph area draws, given the placement and whether cards are on screen. */
export type CanvasContent =
  | { readonly kind: 'failure'; readonly error: Error }
  | { readonly kind: 'arrangement' }
  | { readonly kind: 'placeholder' };

/**
 * A pending placement is not by itself a reason to blank the canvas. Once an
 * arrangement is on screen the editor owns those positions outright, so they are
 * the current state rather than a stale copy of whatever is being recomputed —
 * and taking them away mid-recompute would interrupt a drag. Navigating to
 * another renderer is the case that does clear them, which is why that is the
 * editor's decision and not this one.
 */
export function canvasContent(
  placement: PlacementRenderingState,
  hasArrangement: boolean,
): CanvasContent {
  if (placement.kind === 'failed') return { kind: 'failure', error: placement.error };
  if (hasArrangement) return { kind: 'arrangement' };
  return { kind: 'placeholder' };
}

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
  // Authored keys are card ids that have already been through the schema, so the
  // parse here is a branding step and not expected to reject. It still runs during
  // render, where a throw escapes React and takes the page down instead of
  // reaching the failure state below — so an unusable placement is handed on as a
  // rejecting strategy and reported like any other placement failure.
  // Split from the fallback so authored placement does not depend on `strategy`:
  // a new automatic strategy identity would otherwise rebuild the positioned one
  // and re-run layout, discarding a settled authored render for an identical result.
  const authoredStrategy = useMemo<LayoutStrategy | null>(() => {
    if (authoredPositions === null) return null;
    try {
      const positions = new Map<CardId, LayoutPoint>();
      for (const [cardId, point] of authoredPositions) {
        positions.set(uuidSchema.parse(cardId), point);
      }
      return positionedStrategy(positions);
    } catch (reason: unknown) {
      return () => Promise.reject(toError(reason));
    }
  }, [authoredPositions]);
  const renderingStrategy = authoredStrategy ?? strategy;

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
