import type { SpaceSnapshot } from '@project/core';
import { resolveProductDestinationInSnapshot, type ProductDestination } from '@project/http';
import type { Space } from '@project/graph';
import { destinationOpening, type DestinationOpening } from './destination-opening';
import type { CanvasRendererId } from './renderer';

export type DestinationRestoration =
  | { readonly kind: 'opening'; readonly opening: DestinationOpening }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'ignored' };

/** Resolve one browser location into the complete application opening it names. */
export function destinationRestoration(
  space: Space,
  snapshot: SpaceSnapshot,
  pathname: string,
): DestinationRestoration {
  const resolution = resolveProductDestinationInSnapshot(snapshot, pathname);
  if (resolution.kind === 'unresolved') return { kind: 'not-found' };
  if (resolution.kind !== 'resolved') return { kind: 'ignored' };
  return { kind: 'opening', opening: destinationOpening(space, resolution.destination) };
}

/**
 * Address a renderer Navigation adopted outside an explicit browser command.
 *
 * Explicit Card, Graph and presentation intent is preserved whenever its URL
 * already opens this renderer. A conversion is the opposite case: Navigation
 * has adopted a freshly minted Layout while the URL still opens the Computed
 * View it replaced, so the new Layout receives its own Space View destination.
 */
export function adoptedRendererDestination(
  space: Space,
  snapshot: SpaceSnapshot,
  pathname: string,
  selection: CanvasRendererId,
): ProductDestination | null {
  const restoration = destinationRestoration(space, snapshot, pathname);
  if (restoration.kind === 'opening' && restoration.opening.selection === selection) return null;
  return { kind: 'space-view', spaceId: space.id, spaceViewId: selection };
}
