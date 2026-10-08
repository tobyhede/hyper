import type { MapSurface } from '../src/map-surface';
import type { MapSurfacePolicy } from '../src/map-surface-policy';

/**
 * Hold a canvas surface at one policy, at the Map and Graph it draws now.
 *
 * `composeApp` composes the canvas's surface authoring; a test that needs the
 * canvas under another policy fixes its context through the surface's own
 * `update`, which stops it following Navigation from then on.
 */
export function holdCanvasPolicy(surface: MapSurface, policy: MapSurfacePolicy): void {
  const current = surface.context();
  if (current.kind !== 'canvas') throw new Error('holdCanvasPolicy takes the canvas surface');
  surface.update({ ...current, policy });
}
