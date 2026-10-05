import { COLLAPSED_RESOURCE_SIZE, DEFAULT_OPEN_SIZE, RESOURCE_SHAPES } from '@project/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  resourceShapeOutline,
  type OutlineSize,
  type ResourceShapeOutline,
} from '../src/resource-shape-outline';

type Point = { readonly x: number; readonly y: number };

/** A rect any Resource could be drawn at, from a sliver to a wide Open Size. */
const sizes = fc.record({
  width: fc.double({ min: 1, max: 4000, noNaN: true }),
  height: fc.double({ min: 1, max: 4000, noNaN: true }),
});
const shapes = fc.constantFrom(...RESOURCE_SHAPES);

/** The tolerance a coordinate is compared at, relative to the rect it lies in. */
const toleranceAt = ({ width, height }: OutlineSize): number => 1e-9 * Math.max(width, height);

/** The midpoint of each side of the rect, where handles sit and Edges attach. */
const sideMidpoints = ({ width, height }: OutlineSize): readonly Point[] => [
  { x: width / 2, y: 0 },
  { x: width, y: height / 2 },
  { x: width / 2, y: height },
  { x: 0, y: height / 2 },
];

const onSegment = (point: Point, from: Point, to: Point, epsilon: number): boolean => {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const cross = (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
  if (Math.abs(cross) > epsilon * Math.max(length, 1)) return false;
  return (
    point.x >= Math.min(from.x, to.x) - epsilon &&
    point.x <= Math.max(from.x, to.x) + epsilon &&
    point.y >= Math.min(from.y, to.y) - epsilon &&
    point.y <= Math.max(from.y, to.y) + epsilon
  );
};

const edgesOf = (points: readonly Point[]): readonly (readonly [Point, Point])[] =>
  points.map((point, index) => [point, points[(index + 1) % points.length] ?? point] as const);

/**
 * Where a rounded rect's boundary is, read independently of how it is drawn:
 * a point on one of its straight runs, or on one of its four corner arcs.
 */
function onRoundedRect(
  outline: Extract<ResourceShapeOutline, { kind: 'rect' }>,
  size: OutlineSize,
  p: Point,
): boolean {
  const { width, height } = size;
  const epsilon = toleranceAt(size);
  const { rx, ry } = outline;
  const straight =
    ((Math.abs(p.y) < epsilon || Math.abs(p.y - height) < epsilon) &&
      p.x >= rx - epsilon &&
      p.x <= width - rx + epsilon) ||
    ((Math.abs(p.x) < epsilon || Math.abs(p.x - width) < epsilon) &&
      p.y >= ry - epsilon &&
      p.y <= height - ry + epsilon);
  if (straight) return true;
  if (rx === 0 || ry === 0) return false;
  const cx = p.x < width / 2 ? rx : width - rx;
  const cy = p.y < height / 2 ? ry : height - ry;
  return Math.abs(((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 - 1) < 1e-6;
}

function onOutline(outline: ResourceShapeOutline, size: OutlineSize, point: Point): boolean {
  switch (outline.kind) {
    case 'polygon':
      return edgesOf(outline.points).some(([from, to]) =>
        onSegment(point, from, to, toleranceAt(size)),
      );
    case 'rect':
      return onRoundedRect(outline, size, point);
  }
}

/** Whether a point lies inside or on a convex polygon whose points wind one way. */
function insidePolygon(points: readonly Point[], p: Point, epsilon: number): boolean {
  const sides = edgesOf(points).map(([from, to]) => {
    const length = Math.max(Math.hypot(to.x - from.x, to.y - from.y), 1);
    return ((to.x - from.x) * (p.y - from.y) - (to.y - from.y) * (p.x - from.x)) / length;
  });
  return sides.every((side) => side >= -epsilon) || sides.every((side) => side <= epsilon);
}

function insideOutline(outline: ResourceShapeOutline, size: OutlineSize, p: Point): boolean {
  const { width, height } = size;
  const epsilon = toleranceAt(size);
  switch (outline.kind) {
    case 'polygon':
      return insidePolygon(outline.points, p, epsilon);
    case 'rect': {
      const { rx, ry } = outline;
      if (rx === 0 || ry === 0) {
        return (
          p.x >= -epsilon && p.x <= width + epsilon && p.y >= -epsilon && p.y <= height + epsilon
        );
      }
      const cx = Math.min(Math.max(p.x, rx), width - rx);
      const cy = Math.min(Math.max(p.y, ry), height - ry);
      return ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1 + 1e-6;
    }
  }
}

describe('resourceShapeOutline', () => {
  it('draws every Shape touching the midpoint of every side of its rect, at any size', () => {
    fc.assert(
      fc.property(shapes, sizes, (resourceShape, size) => {
        const outline = resourceShapeOutline(resourceShape, size);
        for (const midpoint of sideMidpoints(size)) {
          expect(
            onOutline(outline, size, midpoint),
            `${resourceShape} at (${midpoint.x}, ${midpoint.y})`,
          ).toBe(true);
        }
      }),
    );
  });

  it('draws every Shape within its rect, at any size', () => {
    fc.assert(
      fc.property(shapes, sizes, (resourceShape, size) => {
        const { width, height } = size;
        const outline = resourceShapeOutline(resourceShape, size);
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
      }),
    );
  });

  it('lays out the Title of every Shape in a rectangle inside the outline, at any size', () => {
    fc.assert(
      fc.property(shapes, sizes, (resourceShape, size) => {
        const { width, height } = size;
        const outline = resourceShapeOutline(resourceShape, size);
        const { inline, block } = outline.inscribed;
        expect(inline).toBeGreaterThanOrEqual(0);
        expect(block).toBeGreaterThanOrEqual(0);
        expect(inline).toBeLessThan(width / 2);
        expect(block).toBeLessThan(height / 2);
        const corners: readonly Point[] = [
          { x: inline, y: block },
          { x: width - inline, y: block },
          { x: width - inline, y: height - block },
          { x: inline, y: height - block },
        ];
        for (const corner of corners) {
          expect(
            insideOutline(outline, size, corner),
            `${resourceShape} corner (${corner.x}, ${corner.y})`,
          ).toBe(true);
        }
      }),
    );
  });

  it('rounds a pill by half its smaller side, at any size, so its ends stay half-circles', () => {
    fc.assert(
      fc.property(sizes, (size) => {
        const radius = Math.min(size.width, size.height) / 2;
        expect(resourceShapeOutline('pill', size)).toMatchObject({
          kind: 'rect',
          rx: radius,
          ry: radius,
        });
      }),
    );
  });

  it('fills the rect with an ellipse, at any size', () => {
    fc.assert(
      fc.property(sizes, (size) => {
        expect(resourceShapeOutline('ellipse', size)).toMatchObject({
          kind: 'rect',
          rx: size.width / 2,
          ry: size.height / 2,
        });
      }),
    );
  });

  it.each([COLLAPSED_RESOURCE_SIZE, DEFAULT_OPEN_SIZE])(
    'draws the hexagon at %o with its side vertices at the side midpoints and flat top and bottom',
    (size) => {
      const { width, height } = size;
      const outline = resourceShapeOutline('hexagon', size);
      expect(outline.kind).toBe('polygon');
      const points = outline.kind === 'polygon' ? outline.points : [];
      expect(points).toContainEqual({ x: 0, y: height / 2 });
      expect(points).toContainEqual({ x: width, y: height / 2 });
      expect(points.filter((point) => point.y === 0)).toHaveLength(2);
      expect(points.filter((point) => point.y === height)).toHaveLength(2);
    },
  );

  it.each([
    [{ width: 260, height: 146 }, [65, 195]],
    [{ width: 800, height: 100 }, [50, 750]],
  ] as const)(
    'insets the hexagon’s points at %o by a quarter of its width, capped at half its height',
    (size, top) => {
      const outline = resourceShapeOutline('hexagon', size);
      const points = outline.kind === 'polygon' ? outline.points : [];
      expect(points.filter((point) => point.y === 0).map((point) => point.x)).toEqual(top);
    },
  );
});
