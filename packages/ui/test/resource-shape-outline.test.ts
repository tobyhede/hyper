import { COLLAPSED_RESOURCE_SIZE, RESOURCE_SHAPES } from '@project/core';
import { describe, expect, it } from 'vitest';
import { resourceShapeOutline, type ResourceShapeOutline } from '../src/resource-shape-outline';

type Point = { readonly x: number; readonly y: number };

const { width, height } = COLLAPSED_RESOURCE_SIZE;
const EPSILON = 1e-9;

/** The midpoint of each side of the Closed Size's rect, where handles sit and Edges attach. */
const SIDE_MIDPOINTS: readonly Point[] = [
  { x: width / 2, y: 0 },
  { x: width, y: height / 2 },
  { x: width / 2, y: height },
  { x: 0, y: height / 2 },
];

const onSegment = (point: Point, from: Point, to: Point): boolean => {
  const cross = (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
  if (Math.abs(cross) > EPSILON) return false;
  return (
    point.x >= Math.min(from.x, to.x) - EPSILON &&
    point.x <= Math.max(from.x, to.x) + EPSILON &&
    point.y >= Math.min(from.y, to.y) - EPSILON &&
    point.y <= Math.max(from.y, to.y) + EPSILON
  );
};

const edgesOf = (points: readonly Point[]): readonly (readonly [Point, Point])[] =>
  points.map((point, index) => [point, points[(index + 1) % points.length] ?? point] as const);

/**
 * Where a rounded rect's boundary is, read independently of how it is drawn:
 * a point on one of its straight runs, or on one of its four corner arcs.
 */
function onRoundedRect(outline: Extract<ResourceShapeOutline, { kind: 'rect' }>, p: Point) {
  const { rx, ry } = outline;
  const straight =
    ((Math.abs(p.y) < EPSILON || Math.abs(p.y - height) < EPSILON) &&
      p.x >= rx - EPSILON &&
      p.x <= width - rx + EPSILON) ||
    ((Math.abs(p.x) < EPSILON || Math.abs(p.x - width) < EPSILON) &&
      p.y >= ry - EPSILON &&
      p.y <= height - ry + EPSILON);
  if (straight) return true;
  if (rx === 0 || ry === 0) return false;
  const cx = p.x < width / 2 ? rx : width - rx;
  const cy = p.y < height / 2 ? ry : height - ry;
  return Math.abs(((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 - 1) < 1e-6;
}

function onOutline(outline: ResourceShapeOutline, point: Point): boolean {
  switch (outline.kind) {
    case 'polygon':
      return edgesOf(outline.points).some(([from, to]) => onSegment(point, from, to));
    case 'rect':
      return onRoundedRect(outline, point);
  }
}

/** Whether a point lies inside or on a convex polygon whose points wind one way. */
function insidePolygon(points: readonly Point[], p: Point): boolean {
  const sides = edgesOf(points).map(
    ([from, to]) => (to.x - from.x) * (p.y - from.y) - (to.y - from.y) * (p.x - from.x),
  );
  return sides.every((side) => side >= -EPSILON) || sides.every((side) => side <= EPSILON);
}

function insideOutline(outline: ResourceShapeOutline, p: Point): boolean {
  switch (outline.kind) {
    case 'polygon':
      return insidePolygon(outline.points, p);
    case 'rect': {
      const { rx, ry } = outline;
      const cx = Math.min(Math.max(p.x, rx), width - rx);
      const cy = Math.min(Math.max(p.y, ry), height - ry);
      if (rx === 0 || ry === 0) return p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
      return ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1 + 1e-6;
    }
  }
}

describe('resourceShapeOutline', () => {
  it.each(RESOURCE_SHAPES)(
    'draws %s touching the midpoint of every side of its rect',
    (resourceShape) => {
      const outline = resourceShapeOutline(resourceShape);
      for (const midpoint of SIDE_MIDPOINTS) {
        expect(
          onOutline(outline, midpoint),
          `${resourceShape} at (${midpoint.x}, ${midpoint.y})`,
        ).toBe(true);
      }
    },
  );

  it.each(RESOURCE_SHAPES)('draws %s within its rect', (resourceShape) => {
    const outline = resourceShapeOutline(resourceShape);
    if (outline.kind === 'rect') {
      expect(outline.rx).toBeLessThanOrEqual(width / 2);
      expect(outline.ry).toBeLessThanOrEqual(height / 2);
      return;
    }
    for (const point of outline.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(height);
    }
  });

  it.each(RESOURCE_SHAPES)(
    'lays out the Title of %s in a rectangle inside the outline',
    (resourceShape) => {
      const outline = resourceShapeOutline(resourceShape);
      const { inline, block } = outline.inscribed;
      expect(inline).toBeGreaterThanOrEqual(0);
      expect(block).toBeGreaterThanOrEqual(0);
      const corners: readonly Point[] = [
        { x: inline, y: block },
        { x: width - inline, y: block },
        { x: width - inline, y: height - block },
        { x: inline, y: height - block },
      ];
      for (const corner of corners) {
        expect(
          insideOutline(outline, corner),
          `${resourceShape} corner (${corner.x}, ${corner.y})`,
        ).toBe(true);
      }
    },
  );

  it('draws the hexagon with its side vertices at the side midpoints and flat top and bottom', () => {
    const outline = resourceShapeOutline('hexagon');
    expect(outline.kind).toBe('polygon');
    const points = outline.kind === 'polygon' ? outline.points : [];
    expect(points).toContainEqual({ x: 0, y: height / 2 });
    expect(points).toContainEqual({ x: width, y: height / 2 });
    expect(points.filter((point) => point.y === 0)).toHaveLength(2);
    expect(points.filter((point) => point.y === height)).toHaveLength(2);
  });

  it('rounds a pill by half its height and an ellipse by half of each axis', () => {
    expect(resourceShapeOutline('pill')).toMatchObject({
      kind: 'rect',
      rx: height / 2,
      ry: height / 2,
    });
    expect(resourceShapeOutline('ellipse')).toMatchObject({
      kind: 'rect',
      rx: width / 2,
      ry: height / 2,
    });
  });
});
