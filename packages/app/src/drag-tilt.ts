import type { MapPosition } from '@project/core';
import { CANVAS_RESOURCE_DRAG_TILT_DEGREES } from '@project/ui';

export const DRAG_TILT_RADIANS = (CANVAS_RESOURCE_DRAG_TILT_DEGREES * Math.PI) / 180;

export function rotateAbout(point: MapPosition, origin: MapPosition, radians: number): MapPosition {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

export function tiltResourcePosition(
  position: MapPosition,
  size: { readonly width?: number | undefined; readonly height?: number | undefined },
  origin: MapPosition,
  radians: number,
): MapPosition {
  const halfX = (size.width ?? 0) / 2;
  const halfY = (size.height ?? 0) / 2;
  const turned = rotateAbout({ x: position.x + halfX, y: position.y + halfY }, origin, radians);
  return { x: turned.x - halfX, y: turned.y - halfY };
}
