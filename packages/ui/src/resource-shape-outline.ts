import { COLLAPSED_RESOURCE_SIZE, type ResourceShape } from '@project/core';

/** A point in the Closed Size's own units, from its top-left corner. */
export interface OutlinePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * How far the rectangle the Title and kind glyph lay out in stands in from
 * each side of the Closed Size, in its own units: `inline` from the left and
 * right sides, `block` from the top and bottom.
 */
export interface InscribedInsets {
  readonly inline: number;
  readonly block: number;
}

/**
 * The outline a Closed Resource is drawn in (ADR 0117), in the units of the
 * Closed Size it fills: a rect whose corners are rounded by `rx` and `ry`, or
 * a polygon. Every outline touches the midpoint of each side of that rect,
 * where the adapter's handles sit and Edges attach
 * (`packages/ui/test/resource-shape-outline.test.ts`).
 */
export type ResourceShapeOutline = (
  | { readonly kind: 'rect'; readonly rx: number; readonly ry: number }
  | { readonly kind: 'polygon'; readonly points: readonly OutlinePoint[] }
) & { readonly inscribed: InscribedInsets };

const { width, height } = COLLAPSED_RESOURCE_SIZE;

/** How far a quarter arc of radius 1 stands in from its corner at 45°. */
const ARC_INSET = 1 - Math.SQRT1_2;

/**
 * How far the hexagon's inscribed rectangle stands in from the top and bottom,
 * as a fraction of the height; its inline inset is what keeps that rectangle's
 * corners inside the hexagon's slanted sides.
 */
const HEXAGON_BLOCK_INSET = 0.15;

/** The outline each Shape is drawn in at the Closed Size. */
export function resourceShapeOutline(resourceShape: ResourceShape): ResourceShapeOutline {
  switch (resourceShape) {
    case 'rectangle':
      return { kind: 'rect', rx: 0, ry: 0, inscribed: { inline: 0, block: 0 } };
    case 'pill': {
      const radius = height / 2;
      const inset = radius * ARC_INSET;
      return { kind: 'rect', rx: radius, ry: radius, inscribed: { inline: inset, block: inset } };
    }
    case 'ellipse':
      return {
        kind: 'rect',
        rx: width / 2,
        ry: height / 2,
        inscribed: { inline: (width / 2) * ARC_INSET, block: (height / 2) * ARC_INSET },
      };
    case 'diamond':
      return {
        kind: 'polygon',
        points: [
          { x: width / 2, y: 0 },
          { x: width, y: height / 2 },
          { x: width / 2, y: height },
          { x: 0, y: height / 2 },
        ],
        inscribed: { inline: width / 4, block: height / 4 },
      };
    case 'hexagon':
      return {
        kind: 'polygon',
        points: [
          { x: width / 4, y: 0 },
          { x: (width * 3) / 4, y: 0 },
          { x: width, y: height / 2 },
          { x: (width * 3) / 4, y: height },
          { x: width / 4, y: height },
          { x: 0, y: height / 2 },
        ],
        inscribed: {
          inline: (width / 4) * (1 - 2 * HEXAGON_BLOCK_INSET),
          block: height * HEXAGON_BLOCK_INSET,
        },
      };
  }
}
