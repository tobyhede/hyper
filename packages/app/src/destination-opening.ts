import type { ThingId, GraphId } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { Space } from '@project/graph';
import type { DiagramId } from '@project/core';
import { requireDefaultDiagram } from './diagram-resolution';

export interface DestinationOpening {
  readonly selection: DiagramId;
  readonly thingId: ThingId | null;
  readonly graphId: GraphId | null;
  readonly presentationThingId: ThingId | null;
}

/** Translate a resolved product destination into the application state it opens. */
export function destinationOpening(
  space: Space,
  destination: ProductDestination,
): DestinationOpening {
  if (destination.kind === 'space') {
    return {
      selection: requireDefaultDiagram(space),
      thingId: null,
      graphId: null,
      presentationThingId: null,
    };
  }
  if (destination.kind === 'diagram') {
    return {
      selection: destination.diagramId,
      thingId: null,
      graphId: null,
      presentationThingId: null,
    };
  }
  if (destination.kind === 'diagram-thing') {
    return {
      selection: destination.diagramId,
      thingId: destination.thingId,
      graphId: null,
      presentationThingId: null,
    };
  }
  if (destination.kind === 'diagram-graph') {
    return {
      selection: destination.diagramId,
      thingId: null,
      graphId: destination.graphId,
      presentationThingId: null,
    };
  }
  if (destination.kind === 'presentation') {
    return {
      selection: destination.diagramId,
      thingId: null,
      graphId: destination.graphId,
      presentationThingId: destination.thingId,
    };
  }
  if (destination.kind === 'graph') {
    const owned = space.lookup.graph(destination.graphId);
    if (owned === undefined) {
      throw new Error(`The resolved Graph ${destination.graphId} does not exist.`);
    }
    return {
      selection: owned.owner.diagram.id,
      thingId: null,
      graphId: destination.graphId,
      presentationThingId: null,
    };
  }
  return {
    selection: requireDefaultDiagram(space),
    thingId: destination.thingId,
    graphId: null,
    presentationThingId: null,
  };
}
