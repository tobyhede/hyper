import { CANVAS, type SpaceAuthoring, type SurfaceAuthoring } from '../src/space-authoring';

const bound = new WeakMap<SpaceAuthoring, SurfaceAuthoring>();

/**
 * A Space's Authoring as its own canvas's drawing sees it, for a collaborator
 * a test builds without composing the canvas's surface. One value per
 * Authoring, so a hook that memoises on it is not rebuilt each render; each
 * call reaches the Space's Authoring when it is made, so a spy still observes.
 */
export const canvasAuthoring = (authoring: SpaceAuthoring): SurfaceAuthoring => {
  const existing = bound.get(authoring);
  if (existing !== undefined) return existing;
  const surface: SurfaceAuthoring = {
    getState: () => authoring.getState(),
    subscribe: (listener) => authoring.subscribe(listener),
    mapPlacement: () => authoring.mapPlacement(),
    edgeEligibility: (proposal) => authoring.edgeEligibility(CANVAS, proposal),
    complete: (completion) => authoring.complete(CANVAS, completion),
  };
  bound.set(authoring, surface);
  return surface;
};
