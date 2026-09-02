import type { CardId, GraphId } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { Space } from '@project/graph';
import { defaultLayout, type CanvasRendererId } from './renderer';

export interface DestinationOpening {
  readonly selection: CanvasRendererId;
  readonly cardId: CardId | null;
  readonly graphId: GraphId | null;
  readonly presentationCardId: CardId | null;
}

/** Translate a resolved product destination into the application state it opens. */
export function destinationOpening(
  space: Space,
  destination: ProductDestination,
): DestinationOpening {
  if (destination.kind === 'space') {
    return {
      selection: defaultLayout(space),
      cardId: null,
      graphId: null,
      presentationCardId: null,
    };
  }
  if (destination.kind === 'layout') {
    return {
      selection: destination.layoutId,
      cardId: null,
      graphId: null,
      presentationCardId: null,
    };
  }
  if (destination.kind === 'layout-card') {
    return {
      selection: destination.layoutId,
      cardId: destination.cardId,
      graphId: null,
      presentationCardId: null,
    };
  }
  if (destination.kind === 'layout-graph') {
    return {
      selection: destination.layoutId,
      cardId: null,
      graphId: destination.graphId,
      presentationCardId: null,
    };
  }
  if (destination.kind === 'presentation') {
    return {
      selection: destination.layoutId,
      cardId: null,
      graphId: destination.graphId,
      presentationCardId: destination.cardId,
    };
  }
  if (destination.kind === 'graph') {
    const owned = space.lookup.graph(destination.graphId);
    if (owned === undefined) {
      throw new Error(`The resolved Graph ${destination.graphId} does not exist.`);
    }
    return {
      selection: owned.owner.layout.id,
      cardId: null,
      graphId: destination.graphId,
      presentationCardId: null,
    };
  }
  return {
    selection: defaultLayout(space),
    cardId: destination.cardId,
    graphId: null,
    presentationCardId: null,
  };
}
