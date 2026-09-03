import type { PlacementRenderingState } from './placement-rendering';

/** What the canvas draws, given the placement and whether Cards are on screen. */
export type CanvasContent =
  | { readonly kind: 'failure'; readonly error: Error }
  | { readonly kind: 'cards' }
  | { readonly kind: 'placeholder' };

/**
 * A pending placement is not by itself a reason to blank the canvas. Once Cards
 * are on the canvas the editor owns those positions outright, so they are the
 * current state rather than a stale copy of whatever is being recomputed —
 * and taking them away mid-recompute would interrupt a drag. Navigating to
 * another Layout is the case that does clear them, which is why that is the
 * editor's decision and not this one.
 */
export function canvasContent(
  placement: PlacementRenderingState,
  hasCardsOnCanvas: boolean,
): CanvasContent {
  if (placement.kind === 'failed') return { kind: 'failure', error: placement.error };
  if (hasCardsOnCanvas) return { kind: 'cards' };
  return { kind: 'placeholder' };
}
