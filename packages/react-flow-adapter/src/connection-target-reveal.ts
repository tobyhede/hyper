/**
 * When a connection drag may *show* seeking-end handles on a Thing.
 *
 * React Flow's own snap radius (`connectionRadius`, 20 at the pinned release) is
 * how a release lands on a handle. Reveal is a wider, product-owned magnet around
 * the Thing's axis-aligned bounds so the author sees the drop before they are
 * already on it. Bounds are in **flow** coordinates (`positionAbsolute`);
 * `connection.pointer` is in **container** coordinates and must be converted
 * with {@link connectionPointerInFlow} before measuring.
 *
 * `.scratch/connection-handle-proximity/issues/01-reveal-seeking-handles-by-proximity-and-eligibility.md`
 */
export const CONNECTION_TARGET_PROXIMITY = 80;

export type CanvasRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type CanvasPoint = {
  readonly x: number;
  readonly y: number;
};

/**
 * Convert React Flow's connection pointer (container coordinates) into flow
 * coordinates so it can be compared with `positionAbsolute`.
 *
 * XYHandle stores `getEventPosition` output on `connection.pointer` without
 * applying the viewport transform; node bounds are already in flow space.
 */
export function connectionPointerInFlow(
  pointer: CanvasPoint,
  transform: readonly [number, number, number],
): CanvasPoint {
  const [panX, panY, zoom] = transform;
  return {
    x: (pointer.x - panX) / zoom,
    y: (pointer.y - panY) / zoom,
  };
}

/**
 * Shortest distance from a point to an axis-aligned rectangle. Zero when the
 * point lies on or inside the rect.
 */
export function distanceToAabb(point: CanvasPoint, rect: CanvasRect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return Math.hypot(dx, dy);
}

/** Whether the pointer is close enough that seeking-end handles may be revealed. */
export function isNearConnectionTarget(
  pointer: CanvasPoint,
  rect: CanvasRect,
  radius: number = CONNECTION_TARGET_PROXIMITY,
): boolean {
  return distanceToAabb(pointer, rect) <= radius;
}

/**
 * Whether this Thing offers the seeking-end affordance for the live drag.
 *
 * Seeking is the role React Flow is looking for; near is proximity; eligible is
 * Space Authoring's answer for releasing here. All three are required — a far or
 * refused Thing stays visually and (for eligibility) interactively quiet.
 */
export function offersConnectionEnd(input: {
  readonly seeking: 'source' | 'target' | null;
  readonly near: boolean;
  readonly eligible: boolean;
}): boolean {
  return input.seeking !== null && input.near && input.eligible;
}
