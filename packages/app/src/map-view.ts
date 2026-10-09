import type { MapId, Resource } from '@project/core';
import { Placement, type ResolvedMap, type Space } from '@project/graph';
import { canvasProjection, type PendingCanvasProjection } from './canvas-projection';
import { mapResources, resolveMap, resourcesOutsideMap } from './map-resolution';
import { otherMapMemberships, type MapMemberships } from './map-memberships';

/** Everything the canvas and the Dock read off the Map being drawn. */
export interface MapView {
  /** The Space this view was built from. */
  readonly space: Space;
  readonly selectedMap: ResolvedMap;
  /** This Map's own placement, before any resize draft is laid over it. */
  readonly mapPlacement: Placement;
  /** The Resources this Map places. */
  readonly placedResources: readonly Resource[];
  /** Everything the canvas draws, before a strategy has placed it. */
  readonly projection: PendingCanvasProjection;
  /** The Space's Resources this Map leaves out, which the Resources list offers. */
  readonly resourcesOutsideMap: readonly Resource[];
  /** Which other Maps hold each Resource. */
  readonly membershipsOutsideMap: MapMemberships;
}

/** Resolves one Map of a Space and derives what is drawn from it. */
export function mapView(space: Space, mapId: MapId): MapView {
  const selectedMap = resolveMap(space, mapId);
  return {
    space,
    selectedMap,
    mapPlacement: Placement.fromMap(selectedMap.map),
    placedResources: mapResources(space, selectedMap.map),
    projection: canvasProjection(space, selectedMap),
    resourcesOutsideMap: resourcesOutsideMap(space, selectedMap.map),
    membershipsOutsideMap: otherMapMemberships(space, selectedMap.map.id),
  };
}
