import type { ResourceId, GraphId } from '@project/core';
import type { ProductDestination } from '@project/http';
import type { Space } from '@project/graph';
import type { MapId } from '@project/core';
import { requireDefaultMap } from './map-resolution';

export interface DestinationOpening {
  readonly selection: MapId;
  readonly resourceId: ResourceId | null;
  readonly graphId: GraphId | null;
  readonly presentationResourceId: ResourceId | null;
}

/** Translate a resolved product destination into the application state it opens. */
export function destinationOpening(
  space: Space,
  destination: ProductDestination,
): DestinationOpening {
  if (destination.kind === 'space') {
    return {
      selection: requireDefaultMap(space),
      resourceId: null,
      graphId: null,
      presentationResourceId: null,
    };
  }
  if (destination.kind === 'map') {
    return {
      selection: destination.mapId,
      resourceId: null,
      graphId: null,
      presentationResourceId: null,
    };
  }
  if (destination.kind === 'map-resource') {
    return {
      selection: destination.mapId,
      resourceId: destination.resourceId,
      graphId: null,
      presentationResourceId: null,
    };
  }
  if (destination.kind === 'map-graph') {
    return {
      selection: destination.mapId,
      resourceId: null,
      graphId: destination.graphId,
      presentationResourceId: null,
    };
  }
  if (destination.kind === 'presentation') {
    return {
      selection: destination.mapId,
      resourceId: null,
      graphId: destination.graphId,
      presentationResourceId: destination.resourceId,
    };
  }
  if (destination.kind === 'graph') {
    const owned = space.lookup.graph(destination.graphId);
    if (owned === undefined) {
      throw new Error(`The resolved Graph ${destination.graphId} does not exist.`);
    }
    return {
      selection: owned.owner.map.id,
      resourceId: null,
      graphId: destination.graphId,
      presentationResourceId: null,
    };
  }
  return {
    selection: requireDefaultMap(space),
    resourceId: destination.resourceId,
    graphId: null,
    presentationResourceId: null,
  };
}
