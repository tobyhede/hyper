import type { CardId, GraphId } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { Space } from '@project/graph';
import type { DiagramId } from '@project/core';
import { requireDefaultDiagram } from './diagram-resolution';

export interface DestinationOpening {
  readonly selection: DiagramId;
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
      selection: requireDefaultDiagram(space),
      cardId: null,
      graphId: null,
      presentationCardId: null,
    };
  }
  if (destination.kind === 'diagram') {
    return {
      selection: destination.diagramId,
      cardId: null,
      graphId: null,
      presentationCardId: null,
    };
  }
  if (destination.kind === 'diagram-card') {
    return {
      selection: destination.diagramId,
      cardId: destination.cardId,
      graphId: null,
      presentationCardId: null,
    };
  }
  if (destination.kind === 'diagram-graph') {
    return {
      selection: destination.diagramId,
      cardId: null,
      graphId: destination.graphId,
      presentationCardId: null,
    };
  }
  if (destination.kind === 'presentation') {
    return {
      selection: destination.diagramId,
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
      selection: owned.owner.diagram.id,
      cardId: null,
      graphId: destination.graphId,
      presentationCardId: null,
    };
  }
  return {
    selection: requireDefaultDiagram(space),
    cardId: destination.cardId,
    graphId: null,
    presentationCardId: null,
  };
}
