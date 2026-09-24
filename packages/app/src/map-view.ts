import { useMemo } from 'react';
import type { MapId, Resource, SpaceSnapshot } from '@project/core';
import { Placement, type ResolvedMap, type Space } from '@project/graph';
import { canvasProjection, type PendingCanvasProjection } from './canvas-projection';
import { mapResources, resolveMap, resourcesOutsideMap } from './map-resolution';
import { otherMapMemberships, type MapMemberships } from './map-memberships';
import { nextResourceTitle } from './titles';

/** Everything the canvas and the Dock read off the Map being drawn. */
export interface MapView {
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
  /** Whether any Resource on this Map is Open. */
  readonly resourceIsOpen: boolean;
}

/** Resolves one Map of a Space and derives what is drawn from it. */
export function mapView(space: Space, mapId: MapId): MapView {
  const selectedMap = resolveMap(space, mapId);
  return {
    selectedMap,
    mapPlacement: Placement.fromMap(selectedMap.map),
    placedResources: mapResources(space, selectedMap.map),
    projection: canvasProjection(space, selectedMap),
    resourcesOutsideMap: resourcesOutsideMap(space, selectedMap.map),
    membershipsOutsideMap: otherMapMemberships(space, selectedMap.map.id),
    resourceIsOpen: Object.values(selectedMap.map.positions).some((at) => at?.open === true),
  };
}

export interface RenderedMapView extends MapView {
  /** The validated Space behind the working snapshot being rendered. */
  readonly renderedSpace: Space;
  /** The Title the next created Resource takes. */
  readonly newResourceTitle: string;
}

/**
 * The Space React is rendering and the Map it draws.
 *
 * Memoized on the working snapshot and the selected Map alone. A drag frame
 * re-renders the component without moving either, so every identity here —
 * the placement `usePlacementRendering` lays out, the Resources Edge
 * Authoring's commands are built over, the projection — holds still across it,
 * and the strategy does not re-run mid-drag. The next Resource Title scans every
 * Title in the Space, so it is keyed on the snapshot alone.
 */
export function useMapView(
  readWorkingSpace: (snapshot: SpaceSnapshot) => Space,
  working: SpaceSnapshot,
  selectedMapId: MapId,
): RenderedMapView {
  const renderedSpace = useMemo(() => readWorkingSpace(working), [readWorkingSpace, working]);
  const newResourceTitle = useMemo(() => nextResourceTitle(working), [working]);
  const view = useMemo(() => mapView(renderedSpace, selectedMapId), [renderedSpace, selectedMapId]);
  return { renderedSpace, newResourceTitle, ...view };
}
