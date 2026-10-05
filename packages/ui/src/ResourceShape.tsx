import { COLLAPSED_RESOURCE_SIZE, type ResourceShape } from '@project/core';
import { cn } from './lib/utils';
import { resourceShapeOutline } from './resource-shape-outline';

/** What a person choosing a Shape reads for each one. */
export const RESOURCE_SHAPE_LABELS = {
  rectangle: 'Rectangle',
  pill: 'Pill',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  hexagon: 'Hexagon',
} as const satisfies Record<ResourceShape, string>;

const ICON_GRID = 24;
const ICON_WIDTH = 20;
const ICON_HEIGHT = (ICON_WIDTH * COLLAPSED_RESOURCE_SIZE.height) / COLLAPSED_RESOURCE_SIZE.width;

/**
 * The box a Shape glyph is drawn in, inside Lucide's 24-unit grid: centred, and
 * in the Closed Size's proportions, so each glyph is the Shape a Closed
 * Resource is drawn in.
 */
export const RESOURCE_SHAPE_ICON_BOX = {
  x: (ICON_GRID - ICON_WIDTH) / 2,
  y: (ICON_GRID - ICON_HEIGHT) / 2,
  width: ICON_WIDTH,
  height: ICON_HEIGHT,
} as const;

/** Lucide's corner radius, which the rectangle takes in the glyph only. */
const ICON_RECTANGLE_RADIUS = 2;

export interface ResourceShapeIconProps {
  readonly shape: ResourceShape;
  /** A Tailwind `size-*` class; the icon fills the box it is given. */
  readonly className?: string;
}

/**
 * A Shape, drawn as the glyph that names it (ADR 0121).
 *
 * Lucide has no ellipse or capsule, so every Shape is drawn from the outline
 * the canvas draws it in (`resourceShapeOutline`), answered for the glyph's own
 * box and stroked at Lucide's weight. The rectangle alone takes Lucide's corner
 * radius, as Lucide's own rectangles do. Decorative: the control or row it sits
 * in names the Shape.
 */
export function ResourceShapeIcon({ shape: resourceShape, className }: ResourceShapeIconProps) {
  const { x, y, width, height } = RESOURCE_SHAPE_ICON_BOX;
  const outline = resourceShapeOutline(resourceShape, { width, height });
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${ICON_GRID} ${ICON_GRID}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      data-slot="resource-shape-icon"
      data-resource-shape={resourceShape}
      className={cn('size-[14px]', className)}
    >
      {outline.kind === 'polygon' ? (
        <polygon
          points={outline.points.map((point) => `${point.x + x},${point.y + y}`).join(' ')}
        />
      ) : resourceShape === 'rectangle' ? (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={ICON_RECTANGLE_RADIUS}
          ry={ICON_RECTANGLE_RADIUS}
        />
      ) : (
        <rect x={x} y={y} width={width} height={height} rx={outline.rx} ry={outline.ry} />
      )}
    </svg>
  );
}
