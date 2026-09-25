/**
 * The shape of a resource in the graph, read from `COLLAPSED_RESOURCE_SIZE` in
 * `@project/core` and handed to the stylesheet.
 *
 * A resource draws its title (ADR 0006), so its content is bounded and every resource is
 * the same shape. That makes the size a design constant rather than something
 * measured: content adapts to the resource, not the resource to the content. It is why
 * a measured DOM size never decides placement here, the way it must in a layout
 * whose nodes are content-sized.
 *
 * Only the proportion is a design decision. The base width is arbitrary:
 * placement is authored in its own coordinate space, and React Flow's zoom maps
 * it to the viewport.
 *
 * **16:9, matching the presentation surface.** A resource in the graph and the same
 * resource being presented are one object, so they share a silhouette — click a resource,
 * present it, and the shape does not change. The ratio is chosen for the medium a
 * presentation actually lands on: projectors and external displays are
 * overwhelmingly 16:9, and that is the worst case to letterbox.
 *
 * **There is one source for the size, and it is `COLLAPSED_RESOURCE_SIZE`.** Do
 * not restate the ratio in a stylesheet: a mismatch would make the graph
 * misrepresent what an audience sees.
 */

import type { CSSProperties } from 'react';
import { COLLAPSED_RESOURCE_SIZE } from '@project/core';

export const RESOURCE_WIDTH = COLLAPSED_RESOURCE_SIZE.width;
export const RESOURCE_HEIGHT = COLLAPSED_RESOURCE_SIZE.height;

/** The size a layout strategy arranges resources at. */
export const RESOURCE_SIZE = { width: RESOURCE_WIDTH, height: RESOURCE_HEIGHT } as const;

/** Application-owned magnetic range for resizing an Open Resource to Close. */
const RESOURCE_CLOSE_SNAP_DISTANCE = 24;

/** Snap a complete near-Closed proposal to the one exact Closed rect. */
export const snapResourceSizeToClose = (size: {
  readonly width: number;
  readonly height: number;
}): { readonly width: number; readonly height: number } =>
  Math.abs(size.width - RESOURCE_WIDTH) <= RESOURCE_CLOSE_SNAP_DISTANCE &&
  Math.abs(size.height - RESOURCE_HEIGHT) <= RESOURCE_CLOSE_SNAP_DISTANCE
    ? RESOURCE_SIZE
    : size;

/**
 * Handed to the graph container so the stylesheet draws resources at exactly the size
 * the strategy placed them at. If these drift, anchors land where the resource isn't.
 */
export const resourceSizeVars =
  // SAFETY: CSSProperties doesn't type CSS custom properties (`--*`); these
  // two are read only by the stylesheet, which is their actual contract.
  {
    '--resource-width': `${RESOURCE_WIDTH}px`,
    '--resource-height': `${RESOURCE_HEIGHT}px`,
  } as CSSProperties;
