import { useMemo, useSyncExternalStore } from 'react';
import type { ComposedApp } from './compose-app';
import { useCanvasRendering } from './canvas-rendering';
import type { MapSurface } from './map-surface';
import { useAnySpaceReplacingImage } from './open-spaces-context';
import { useAuthoringAvailability } from './use-authoring-availability';
import { nextResourceTitle } from './titles';

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
  const ownReplacement = useSyncExternalStore(
    app.imageReplacement.subscribe,
    app.imageReplacement.getState,
  );
  const anyReplacement = useAnySpaceReplacingImage();
  const view = surface.view();
  const { working } = state.session;
  const newResourceTitle = useMemo(() => nextResourceTitle(working), [working]);
  const canvasRendering = useCanvasRendering(surface.adapter, {
    projection: view.projection,
    mapPlacement: view.mapPlacement,
    activeGraphId: surface.context().graphId,
  });
  const availability = useAuthoringAvailability(
    {
      ...facts,
      editable: canvasRendering.hasResourcesOnCanvas,
      replacingImage: ownReplacement || anyReplacement,
      editingEmbeddedMap: canvasRendering.editingEmbeddedMap,
    },
    state.replacementEpoch,
  );
  const offered = surface.availability(availability.availability);
  return { view, newResourceTitle, canvasRendering, ...availability, availability: offered };
}

/** What one drawing of a Map reads off its surface in a render. */
export type MapSurfaceReading = ReturnType<typeof useMapSurface>;
