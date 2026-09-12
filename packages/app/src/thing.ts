/**
 * The shape of a thing in the graph — declared once, consumed by both the diagram
 * and the stylesheet.
 *
 * A thing draws its title (ADR 0006), so its content is bounded and every thing is
 * the same shape. That makes the size a design constant rather than something
 * measured: content adapts to the thing, not the thing to the content. It is why
 * a measured DOM size never decides placement here, the way it must in a layout
 * whose nodes are content-sized.
 *
 * Expressed as a ratio because that is the part that is deliberate. The base
 * width is arbitrary: placement is authored in its own coordinate space, and React
 * Flow's zoom maps it to the viewport, so only the proportion is a design decision.
 *
 * **16:9, matching the presentation surface.** A thing in the graph and the same
 * thing being presented are one object, so they share a silhouette — click a thing,
 * present it, and the shape does not change. The ratio is chosen for the medium a
 * presentation actually lands on: projectors and external displays are
 * overwhelmingly 16:9, and that is the worst case to letterbox.
 *
 * **There is one source for the ratio, and it is this constant.** The frame an
 * opened or presented thing was drawn in used to restate it in a stylesheet
 * (`.thing-pane__panel`), and that rule went with the creation panes (ADR 0089);
 * what draws an opened or presented Thing now is `.thing--full`, which takes its
 * box from the node React Flow sizes from this constant rather than declaring a
 * ratio of its own. So a change here moves both surfaces together — which
 * matters because a mismatch would make the graph misrepresent what an audience
 * sees, and would break outright if the "show full content" view of ADR 0006
 * arrives and a thing becomes a live preview of a slide.
 *
 * (The predecessor was 260x300 portrait, inherited from when a thing rendered a
 * clipped page rather than a title.)
 */

import type { CSSProperties } from 'react';
import { COLLAPSED_THING_SIZE } from '@project/core';

export const THING_WIDTH = COLLAPSED_THING_SIZE.width;
export const THING_HEIGHT = COLLAPSED_THING_SIZE.height;

/** The size a layout strategy arranges things at. */
export const THING_SIZE = { width: THING_WIDTH, height: THING_HEIGHT } as const;

/** Application-owned magnetic range for resizing an Open Thing to Close. */
export const THING_CLOSE_SNAP_DISTANCE = 24;

/** Snap a complete near-Closed proposal to the one exact Closed rect. */
export const snapThingSizeToClose = (size: {
  readonly width: number;
  readonly height: number;
}): { readonly width: number; readonly height: number } =>
  Math.abs(size.width - THING_WIDTH) <= THING_CLOSE_SNAP_DISTANCE &&
  Math.abs(size.height - THING_HEIGHT) <= THING_CLOSE_SNAP_DISTANCE
    ? THING_SIZE
    : size;

/**
 * Handed to the graph container so the stylesheet draws things at exactly the size
 * the strategy placed them at. If these drift, anchors land where the thing isn't.
 */
export const thingSizeVars =
  // SAFETY: CSSProperties doesn't type CSS custom properties (`--*`); these
  // two are read only by the stylesheet, which is their actual contract.
  {
    '--thing-width': `${THING_WIDTH}px`,
    '--thing-height': `${THING_HEIGHT}px`,
  } as CSSProperties;
