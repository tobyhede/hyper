/**
 * The camera's numbers: how it frames, and how long it takes.
 *
 * A plain module beside `resource.ts` and `colors.ts` rather than part of
 * `components/cameras.tsx`, because `OVERVIEW_FIT` is read by React Flow's own
 * `fitView` prop in `SpaceCanvas` as well as by the camera that has to agree
 * with it, and a component module that exports an object costs Fast Refresh.
 * The behaviour these feed — and the policy governing it — is in
 * `components/cameras.tsx` (ADR 0027, ADR 0043, ADR 0044). Embedded Map
 * offset and zoom are `spaceResourceEmbedCamera` here for the same Fast Refresh
 * reason — the seam component imports it rather than calling `embedCamera`
 * directly.
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
 * How much room the presented resource leaves around itself.
 *
 * A React Flow `padding`, not a divisor: `parsePadding` computes
 * `(viewport - viewport / (1 + p)) * 0.5` per side, so the content ends up
 * occupying `viewport / (1 + p)`. A numeric padding therefore reads as "make the
 * content box this much bigger than the content", and **not** as a fraction of
 * the viewport — which is the natural reading and is wrong by 8% at this value.
 */
export const PRESENTING_PADDING = 0.15;

/**
 * How the overview frames the graph, shared by the `fitView` prop and the camera.
 *
 * `maxZoom` caps the fit at natural size. Without it `MAX_ZOOM` applies, and a
 * space with a single resource — which is what a new space is (ADR 0018) — gets
 * scaled until it fills the screen. Padding does not help: it reserves margin,
 * it does not cap zoom. The prop-driven first fit and the camera's own must
 * agree, or the one-resource space fits huge and is then animated back out.
 */
export const OVERVIEW_FIT = { padding: 0.2, maxZoom: 1 } as const;

/**
 * The canvas-wide zoom ceiling, and it is load-bearing twice over.
 *
 * React Flow's default is `maxZoom: 2`. A resource is 260x146, so filling a
 * 1280x720 viewport with one needs about 3.97 and a 4K one about 12.8 — all of
 * it outside that default extent.
 *
 * **It bounds the presenting zoom directly.** `fitView` runs its result
 * through `clamp(zoom, minZoom, maxZoom)`, so at the default the presented resource
 * would simply stop at 2x and never fill the screen.
 *
 * **It bounds the wheel too.** `setCenter` ends in `zoom.transform`, which
 * applies a transform directly and never consults `scaleExtent`, while the
 * wheel, pinch and `scaleBy` paths all clamp `k` into it. With a ceiling below
 * the presenting zoom, the first wheel tick during a presentation drops the
 * zoom to that ceiling — the presented resource shrinking mid-sentence, and
 * staying there until the next traversal step.
 *
 * React Flow's presentation tutorial hits the mirror image of this and answers it
 * the same way — it sets `minZoom={0.1}` because "our slides are quite large, and
 * the default minimum zoom level is not enough to zoom out and see multiple
 * slides at once". Ours are small, so it is the ceiling that has to move.
 *
 * A constant rather than a value derived from the viewport, because that is what
 * the documented examples do. It caps the presenting zoom on a display past
 * about 5K, which is a framing choice to revisit by looking at one.
 */
export const MAX_ZOOM = 16;

/** How long the overview pulls back over. */
export const OVERVIEW_DURATION = 400;

/** How long the move onto the presented resource takes: one duration, because there is one move. */
export const PRESENTING_DURATION = 600;
