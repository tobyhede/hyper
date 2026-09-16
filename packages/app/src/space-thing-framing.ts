import type { DiagramPosition, ThingDocument } from '@project/core';
import type { EmbeddedBounds } from './embedded-diagram';

/** The Diagram-coordinate centre and scale a Space Thing stores for its window. */
export type SpaceThingFraming = NonNullable<Extract<ThingDocument, { kind: 'space' }>['framing']>;

/**
 * How an embedding places authored coordinates inside the Space Thing's window.
 *
 * Absent framing fits the selected Diagram from its origin into the inset, which
 * is the renderer the schema documents until a view has been framed. Authored
 * framing is a camera: the stored centre sits at the window's midpoint at the
 * stored zoom, independent of the containing Thing's size on Enter.
 */
export function embedCamera(
  bounds: EmbeddedBounds,
  origin: DiagramPosition,
  framing: SpaceThingFraming | undefined,
) {
  if (framing === undefined) {
    return {
      offset: { x: bounds.left - origin.x, y: bounds.top - origin.y },
      zoom: 1,
    };
  }
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return {
    offset: {
      x: bounds.left + width / 2 - framing.centreX * framing.zoom,
      y: bounds.top + height / 2 - framing.centreY * framing.zoom,
    },
    zoom: framing.zoom,
  };
}

/** Inverse of the embed camera: a pointer proposal back into Diagram coordinates. */
export function authoredFromDrawn(
  drawn: DiagramPosition,
  offset: DiagramPosition,
  zoom: number,
): DiagramPosition {
  return {
    x: (drawn.x - offset.x) / zoom,
    y: (drawn.y - offset.y) / zoom,
  };
}

/**
 * The framing that matches the default origin-fit, so the first pan or zoom can
 * start from what is already on screen rather than jumping to a stored centre.
 */
export function framingFromFit(origin: DiagramPosition, bounds: EmbeddedBounds): SpaceThingFraming {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  return {
    centreX: origin.x + width / 2,
    centreY: origin.y + height / 2,
    zoom: 1,
  };
}

/** Shift the camera by a drawn-space delta, keeping authored coordinates still. */
export function panFraming(framing: SpaceThingFraming, delta: DiagramPosition): SpaceThingFraming {
  return {
    centreX: framing.centreX - delta.x / framing.zoom,
    centreY: framing.centreY - delta.y / framing.zoom,
    zoom: framing.zoom,
  };
}

const MIN_PORTAL_ZOOM = 0.2;
const MAX_PORTAL_ZOOM = 8;

/** Scale the camera, clamped to the portal's own zoom extent. */
export function zoomFraming(framing: SpaceThingFraming, factor: number): SpaceThingFraming {
  const zoom = Math.min(MAX_PORTAL_ZOOM, Math.max(MIN_PORTAL_ZOOM, framing.zoom * factor));
  return { centreX: framing.centreX, centreY: framing.centreY, zoom };
}

/**
 * React Flow's viewport for a canvas of the given size showing this framing.
 *
 * Enter spends this on the entered canvas's own size so it does not inherit
 * the portal's geometry — held by `packages/app/test/cameras.test.tsx`.
 */
export function viewportFromFraming(framing: SpaceThingFraming, width: number, height: number) {
  return {
    x: width / 2 - framing.centreX * framing.zoom,
    y: height / 2 - framing.centreY * framing.zoom,
    zoom: framing.zoom,
  };
}
