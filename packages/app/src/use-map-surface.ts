import { useSyncExternalStore } from 'react';
import type { ComposedApp } from './compose-app';
import { useCanvasRendering } from './canvas-rendering';
import type { MapSurface } from './map-surface';
import { useAuthoringAvailability } from './use-authoring-availability';

/** The same projection and availability for every drawing of a Map. */
export function useMapSurface(
  app: ComposedApp,
  surface: MapSurface,
  facts: {
    readonly presenting: boolean;
    readonly spaceOnCanvas: boolean;
    readonly creatingSpaceResource: boolean;
  },
) {
  const state = useSyncExternalStore(surface.authoring.subscribe, surface.authoring.getState);
  const replacingImage = useSyncExternalStore(
    app.imageReplacement.subscribe,
    app.imageReplacement.getState,
  );
  const view = surface.view();
  const canvasRendering = useCanvasRendering(surface.adapter, {
    projection: view.projection,
    mapPlacement: view.mapPlacement,
    activeGraphId: surface.context().graphId,
  });
  const availability = useAuthoringAvailability(
    {
      ...facts,
      editable: canvasRendering.hasResourcesOnCanvas,
      replacingImage,
      editingEmbeddedMap: canvasRendering.editingEmbeddedMap,
    },
    state.replacementEpoch,
  );
  const offered = surface.availability(availability.availability);
  return { view, canvasRendering, ...availability, availability: offered };
}
