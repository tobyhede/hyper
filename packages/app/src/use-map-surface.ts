import { useMemo, useSyncExternalStore } from 'react';
import type { AuthoringInProgress } from './authoring-availability';
import type { ComposedApp } from './compose-app';
import { useCanvasRendering, type CanvasRendering } from './canvas-rendering';
import type { MapSurface } from './map-surface';
import { useAnySpaceReplacingImage } from './open-spaces-context';
import { useAuthoringAvailability } from './use-authoring-availability';
import { nextResourceTitle } from './titles';

/**
 * The availability facts a drawing answers from its render-adapter half: it
 * may be edited while the adapter holds Resources on the canvas.
 */
export function renderedFacts(
  rendering: Pick<CanvasRendering, 'hasResourcesOnCanvas' | 'editingEmbeddedMap'>,
): Pick<AuthoringInProgress, 'editable' | 'editingEmbeddedMap'> {
  return {
    editable: rendering.hasResourcesOnCanvas,
    editingEmbeddedMap: rendering.editingEmbeddedMap,
  };
}

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
  // The Space Authoring state an Edit mints from, rather than the surface's
  // copy, which lags until the surface observes the Space
  // (`use-map-surface.test.tsx`, "commits no title other than the one an Edit
  // would mint").
  const { working } = useSyncExternalStore(app.authoring.subscribe, app.authoring.getState).session;
  const newResourceTitle = useMemo(() => nextResourceTitle(working), [working]);
  const view = surface.view();
  const canvasRendering = useCanvasRendering(surface.adapter, {
    projection: view.projection,
    mapPlacement: view.mapPlacement,
    activeGraphId: surface.context().graphId,
  });
  const availability = useAuthoringAvailability(
    {
      ...facts,
      ...renderedFacts(canvasRendering),
      replacingImage: ownReplacement || anyReplacement,
    },
    state.replacementEpoch,
  );
  const offered = surface.availability(availability.availability);
  return { view, newResourceTitle, canvasRendering, ...availability, availability: offered };
}

/** What one drawing of a Map reads off its surface in a render. */
export type MapSurfaceReading = ReturnType<typeof useMapSurface>;
