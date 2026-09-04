import type { Space } from '@project/graph';
import { canvasRendererKey, layoutNotFound, type CanvasRendererId } from './renderer';

/** One authored Layout the canvas can draw. */
export interface CanvasRenderer {
  readonly selection: CanvasRendererId;
  readonly title: string;
}

/** Every authored Layout the canvas can draw. */
export type CanvasRenderers = readonly CanvasRenderer[];

export const canvasRenderers = (space: Space): CanvasRenderers =>
  space.layouts.map((layout) => ({ selection: layout.id, title: layout.title }));

export function currentRenderer(renderers: CanvasRenderers, id: CanvasRendererId): CanvasRenderer {
  const key = canvasRendererKey(id);
  const row = renderers.find((candidate) => canvasRendererKey(candidate.selection) === key);
  if (row === undefined) throw layoutNotFound(id);
  return row;
}
