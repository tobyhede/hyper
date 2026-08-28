import { FLOW_SPACE_VIEW_ID, isComputedViewId, type CardId } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { Space } from '@project/graph';
import { defaultRenderer, type CanvasRendererId } from './renderer';

export interface DestinationOpening {
  readonly selection: CanvasRendererId;
  readonly cardId: CardId | null;
}

/** Translate a resolved product destination into the application state it opens. */
export function destinationOpening(
  space: Space,
  destination: ProductDestination,
): DestinationOpening {
  if (destination.kind === 'space') {
    return { selection: defaultRenderer(space), cardId: null };
  }
  if (destination.kind === 'space-view') {
    return { selection: destination.spaceViewId, cardId: null };
  }
  if (destination.kind === 'space-view-card') {
    return { selection: destination.spaceViewId, cardId: destination.cardId };
  }
  const opening = defaultRenderer(space);
  const layout = isComputedViewId(opening) ? undefined : space.lookup.layout(opening)?.layout;
  const selection =
    layout !== undefined && layout.positions[destination.cardId] === undefined
      ? FLOW_SPACE_VIEW_ID
      : opening;
  return { selection, cardId: destination.cardId };
}
