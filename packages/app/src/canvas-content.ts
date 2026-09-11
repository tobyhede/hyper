import type { PlacementRenderingState } from './placement-rendering';

/** What the canvas draws, given the placement and whether Things are on screen. */
export type CanvasContent =
  | { readonly kind: 'failure'; readonly error: Error }
  | { readonly kind: 'things' }
  | { readonly kind: 'placeholder' };

/**
 * A pending placement is not by itself a reason to blank the canvas. Once Things
 * are on the canvas the editor owns those positions outright, so they are the
 * current state rather than a stale copy of whatever is being recomputed —
 * and taking them away mid-recompute would interrupt a drag. Navigating to
 * another Diagram is the case that does clear them, which is why that is the
 * editor's decision and not this one.
 */
export function canvasContent(
  placement: PlacementRenderingState,
  hasThingsOnCanvas: boolean,
): CanvasContent {
  if (placement.kind === 'failed') return { kind: 'failure', error: placement.error };
  if (hasThingsOnCanvas) return { kind: 'things' };
  return { kind: 'placeholder' };
}
