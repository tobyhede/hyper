import type { DiagramPosition } from '@project/core';
import { CANVAS_THING_DRAG_TILT_DEGREES } from '@project/ui';

export const DRAG_TILT_RADIANS = (CANVAS_THING_DRAG_TILT_DEGREES * Math.PI) / 180;

export function rotateAbout(
  point: DiagramPosition,
  origin: DiagramPosition,
  radians: number,
): DiagramPosition {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

export function tiltThingPosition(
  position: DiagramPosition,
  size: { readonly width?: number | undefined; readonly height?: number | undefined },
  origin: DiagramPosition,
  radians: number,
): DiagramPosition {
  const halfX = (size.width ?? 0) / 2;
  const halfY = (size.height ?? 0) / 2;
  const turned = rotateAbout({ x: position.x + halfX, y: position.y + halfY }, origin, radians);
  return { x: turned.x - halfX, y: turned.y - halfY };
}
