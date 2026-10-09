import { useSyncExternalStore } from 'react';
import type { SpaceSnapshot } from '@project/core';
import type { ComposedApp } from './compose-app';
import { useCanvasRendering } from './canvas-rendering';
import type { MapSurface } from './map-surface';
import { useAnySpaceReplacingImage } from './open-spaces-context';
import { useAuthoringAvailability } from './use-authoring-availability';
import { nextResourceTitle } from './titles';

/**
 * One title scan per working Space rather than per drawing: every drawing of a
 * Space reads the same snapshot, which an Edit replaces rather than changes.
 */
const resourceTitles = new WeakMap<SpaceSnapshot, string>();
const newResourceTitleOf = (working: SpaceSnapshot): string => {
  const known = resourceTitles.get(working);
  if (known !== undefined) return known;
  const title = nextResourceTitle(working);
  resourceTitles.set(working, title);
  return title;
};

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
  const newResourceTitle = newResourceTitleOf(state.session.working);
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
