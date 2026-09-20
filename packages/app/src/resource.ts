/**
 * The shape of a resource in the graph — declared once, consumed by both the map
 * and the stylesheet.
 *
 * A resource draws its title (ADR 0006), so its content is bounded and every resource is
 * the same shape. That makes the size a design constant rather than something
 * measured: content adapts to the resource, not the resource to the content. It is why
 * a measured DOM size never decides placement here, the way it must in a layout
 * whose nodes are content-sized.
 *
 * Expressed as a ratio because that is the part that is deliberate. The base
 * width is arbitrary: placement is authored in its own coordinate space, and React
 * Flow's zoom maps it to the viewport, so only the proportion is a design decision.
 *
 * **16:9, matching the presentation surface.** A resource in the graph and the same
 * resource being presented are one object, so they share a silhouette — click a resource,
 * present it, and the shape does not change. The ratio is chosen for the medium a
 * presentation actually lands on: projectors and external displays are
 * overwhelmingly 16:9, and that is the worst case to letterbox.
 *
 * **There is one source for the ratio, and it is this constant.** The frame an
 * opened or presented resource was drawn in used to restate it in a stylesheet
 * (`.resource-pane__panel`), and that rule went with the creation panes (ADR 0089);
 * what draws an opened or presented Resource now is `.resource--full`, which takes its
 * box from the node React Flow sizes from this constant rather than declaring a
 * ratio of its own. So a change here moves both surfaces together — which
 * matters because a mismatch would make the graph misrepresent what an audience
 * sees, and would break outright if the "show full content" view of ADR 0006
 * arrives and a resource becomes a live preview of a slide.
 *
 * (The predecessor was 260x300 portrait, inherited from when a resource rendered a
 * clipped page rather than a title.)
 */

import type { CSSProperties } from 'react';
import { COLLAPSED_RESOURCE_SIZE } from '@project/core';

export const RESOURCE_WIDTH = COLLAPSED_RESOURCE_SIZE.width;
export const RESOURCE_HEIGHT = COLLAPSED_RESOURCE_SIZE.height;

/** The size a layout strategy arranges resources at. */
export const RESOURCE_SIZE = { width: RESOURCE_WIDTH, height: RESOURCE_HEIGHT } as const;

/** Application-owned magnetic range for resizing an Open Resource to Close. */
export const RESOURCE_CLOSE_SNAP_DISTANCE = 24;

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
