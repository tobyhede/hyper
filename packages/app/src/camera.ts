/**
 * The canvas camera's numbers: how a Map is framed when the canvas opens, and
 * how far the canvas may zoom.
 *
 * A plain module beside `resource.ts` and `colors.ts` rather than a component
 * module, because a component module that exports an object costs Fast
 * Refresh. Embedded Map offset and zoom are `spaceResourceEmbedCamera` here for
 * the same reason — the seam component imports it rather than calling
 * `embedCamera` directly.
 */
import type { MapPosition } from '@project/core';
import type { EmbeddedBounds } from './embedded-map';
import { embedCamera, type SpaceResourceFraming } from './space-resource-framing';

/** Places an embedded Map at a Space Resource's stored camera offset. */
export function spaceResourceEmbedCamera(
  bounds: EmbeddedBounds,
  origin: MapPosition,
  framing: SpaceResourceFraming | undefined,
) {
  return embedCamera(bounds, origin, framing);
}

/**
 * How the canvas frames a Map when it opens, through React Flow's `fitView` prop.
 *
 * `maxZoom` caps the fit at natural size. Without it `MAX_ZOOM` applies, and a
 * space with a single resource — which is what a new space is (ADR 0018) — gets
 * scaled until it fills the screen. Padding does not help: it reserves margin,
 * it does not cap zoom.
 */
export const OVERVIEW_FIT = { padding: 0.2, maxZoom: 1 } as const;

/**
 * The canvas-wide zoom ceiling.
 *
 * React Flow's default is `maxZoom: 2`. A Resource is 260x146 at the Closed
 * Size, so filling a 1280x720 viewport with one needs a zoom of about 4.9 and a
 * 3840x2160 one about 14.8 — all of it outside that default extent. An author
 * zooming in to read or edit one Resource's content would stop at 2x.
 *
 * A constant rather than a value derived from the viewport, because that is what
 * the documented examples do.
 */
export const MAX_ZOOM = 16;
