import fc from 'fast-check';
import { getBezierPath, Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { GraphId } from '@project/core';

import type { EdgeAttachment } from '../src/edge-attachment';
import {
  DETACHED_END_TRIM,
  GRAPH_LANE_SPACING,
  graphLanes,
  laneBezier,
  laneSpan,
  type GraphLane,
} from '../src/edge-lanes';
import { uuid } from './uuid';

/** Every number a path's commands carry, in order. */
const numbers = (path: string): number[] =>
  (path.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

describe('graphLanes', () => {
  const [RED, BLUE] = ['1', '2'].map((id) => uuid(`00000000-0000-4000-8000-00000000020${id}`));
  const edge = (graphId: GraphId, source: string, target: string) => ({
    id: `${graphId}::${source}::${target}`,
    graphId,
    source,
    target,
  });
  const offsets = (lanes: ReadonlyMap<string, GraphLane>) =>
    [...lanes.values()].map((l) => l.offset);

  it('leaves a lone Edge on the centre line', () => {
    expect(graphLanes([edge(RED!, 'a', 'b')], null)).toEqual(
      new Map([[`${RED}::a::b`, { offset: 0, reach: 0, connects: true }]]),
    );
  });

  it('keeps the centre for the first of a shared pair and stacks the rest outwards', () => {
    const lanes = graphLanes(
      [RED!, BLUE!, uuid('00000000-0000-4000-8000-000000000203')].map((g) => edge(g, 'a', 'b')),
      null,
    );

    expect(offsets(lanes)).toEqual([0, GRAPH_LANE_SPACING, 2 * GRAPH_LANE_SPACING]);
  });

  it('bundles an Edge with its reverse', () => {
    const lanes = graphLanes([edge(RED!, 'a', 'b'), edge(BLUE!, 'b', 'a')], null);

    expect(lanes.get(`${RED}::a::b`)?.offset).toBe(0);
    expect(lanes.get(`${BLUE}::b::a`)?.offset).toBe(GRAPH_LANE_SPACING);
  });

  it('puts the Active Graph on the centre whatever order it arrives in', () => {
    const lanes = graphLanes([edge(RED!, 'a', 'b'), edge(BLUE!, 'a', 'b')], BLUE!);

    expect(lanes.get(`${BLUE}::a::b`)).toEqual({
      offset: 0,
      reach: GRAPH_LANE_SPACING,
      connects: true,
    });
    expect(lanes.get(`${RED}::a::b`)).toEqual({
      offset: GRAPH_LANE_SPACING,
      reach: GRAPH_LANE_SPACING,
      connects: false,
    });
  });

  it('splits the centre between both directions of a pair the Active Graph holds', () => {
    const lanes = graphLanes(
      [edge(RED!, 'a', 'b'), edge(BLUE!, 'b', 'a'), edge(BLUE!, 'a', 'b')],
      BLUE!,
    );

    const reach = (3 * GRAPH_LANE_SPACING) / 2;
    expect(lanes.get(`${BLUE}::a::b`)).toEqual({
      offset: -GRAPH_LANE_SPACING / 2,
      reach,
      connects: true,
    });
    expect(lanes.get(`${BLUE}::b::a`)).toEqual({
      offset: GRAPH_LANE_SPACING / 2,
      reach,
      connects: true,
    });
    expect(lanes.get(`${RED}::a::b`)).toEqual({ offset: reach, reach, connects: false });
  });

  it('keeps the centre for another Graph where the Active Graph has no Edge in the pair', () => {
    const lanes = graphLanes([edge(RED!, 'a', 'b')], BLUE!);

    expect(lanes.get(`${RED}::a::b`)).toEqual({ offset: 0, reach: 0, connects: false });
  });

  it('gives every Edge of a pair how far out the pair’s outermost lane runs', () => {
    const lanes = graphLanes(
      [edge(RED!, 'a', 'b'), edge(BLUE!, 'b', 'a'), edge(BLUE!, 'a', 'b'), edge(RED!, 'c', 'd')],
      BLUE!,
    );

    expect([...lanes.values()].map((lane) => lane.reach)).toEqual([
      (3 * GRAPH_LANE_SPACING) / 2,
      (3 * GRAPH_LANE_SPACING) / 2,
      (3 * GRAPH_LANE_SPACING) / 2,
      0,
    ]);
  });

  it('connects every Edge while no Graph is active', () => {
    const lanes = graphLanes([edge(RED!, 'a', 'b'), edge(BLUE!, 'a', 'b')], null);

    expect([...lanes.values()].every((lane) => lane.connects)).toBe(true);
  });
});

describe('laneBezier', () => {
  /** Side by side at one height: React Flow draws this as a straight line. */
  const level: EdgeAttachment = {
    sourceX: 0,
    sourceY: 50,
    sourcePosition: Position.Right,
    targetX: 300,
    targetY: 50,
    targetPosition: Position.Left,
  };
  const stacked: EdgeAttachment = {
    sourceX: 100,
    sourceY: 0,
    sourcePosition: Position.Bottom,
    targetX: 140,
    targetY: 200,
    targetPosition: Position.Top,
  };
  const reversed: EdgeAttachment = {
    sourceX: 300,
    sourceY: 50,
    sourcePosition: Position.Left,
    targetX: 0,
    targetY: 50,
    targetPosition: Position.Right,
  };

  it('is React Flow’s own bezier for a lone Edge', () => {
    const [path, labelX, labelY] = getBezierPath(level);
    expect(laneBezier(level, 0)).toEqual({ path, labelX, labelY });
  });

  /**
   * A straight Edge's offset is its translate: every point of the lane's path —
   * anchors, control points and all — is the lone path's point moved by one
   * vector, so its lanes are straight lines beside it. A curved Edge's lanes
   * bend with it, which the properties below hold.
   */
  it.each([
    ['level', level, [0, 8]],
    ['reversed', reversed, [0, 8]],
  ] as const)('moves a %s Edge whole, below it', (_, attachment, [dx, dy]) => {
    const lone = numbers(laneBezier(attachment, 0).path);
    const laned = numbers(laneBezier(attachment, 8).path);

    expect(laned).toHaveLength(lone.length);
    laned.forEach((value, index) => {
      expect(value - lone[index]!).toBeCloseTo(index % 2 === 0 ? dx : dy);
    });
  });

  it('keeps a level Edge’s lanes straight', () => {
    const ys = numbers(laneBezier(level, 8).path).filter((_, index) => index % 2 === 1);
    expect(new Set(ys)).toEqual(new Set([58]));
  });

  /** The cubics a path draws, joined end to end: how long they are, and how near a point is. */
  const cubic = (path: string) => {
    const n = numbers(path);
    const pieces: ((t: number) => [number, number])[] = [];
    for (let i = 2; i + 6 <= n.length; i += 6) {
      const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = n.slice(i - 2, i + 6);
      pieces.push((t) => {
        const u = 1 - t;
        const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
        return [
          w[0] * a + w[1] * c + w[2] * e + w[3] * g,
          w[0] * b + w[1] * d + w[2] * f + w[3] * h,
        ];
      });
    }
    let length = 0;
    for (const point of pieces) {
      for (let i = 1; i <= 1000; i += 1) {
        const [x0, y0] = point((i - 1) / 1000);
        const [x1, y1] = point(i / 1000);
        length += Math.hypot(x1 - x0, y1 - y0);
      }
    }
    const distanceTo = ([x, y]: readonly number[]): number =>
      Math.min(
        ...pieces.flatMap((point) =>
          Array.from({ length: 20_001 }, (_, i) => {
            const [px, py] = point(i / 20_000);
            return Math.hypot(px - x!, py - y!);
          }),
        ),
      );
    return { length, distanceTo };
  };

  /** Where a path starts and where it ends. */
  const ends = (path: string): number[] => {
    const n = numbers(path);
    return [...n.slice(0, 2), ...n.slice(-2)];
  };

  it('leaves a fifth of a level Edge undrawn at each end and keeps it level', () => {
    const [x1, y1, , , , , x2, y2] = numbers(laneBezier(level, 8, DETACHED_END_TRIM).path);

    expect(x1).toBeCloseTo(60, 1);
    expect(x2).toBeCloseTo(240, 1);
    expect([y1, y2]).toEqual([58, 58]);
  });

  it.each([
    ['level', level],
    ['stacked', stacked],
    ['reversed', reversed],
  ] as const)(
    'draws the middle of a %s Edge’s own curve, a fifth short at each end',
    (_, attachment) => {
      const whole = laneBezier(attachment, GRAPH_LANE_SPACING);
      const part = laneBezier(attachment, GRAPH_LANE_SPACING, DETACHED_END_TRIM);
      const curve = cubic(whole.path);
      const [x1, y1, x2, y2] = ends(part.path);

      expect(curve.distanceTo([x1!, y1!])).toBeLessThan(0.1);
      expect(curve.distanceTo([x2!, y2!])).toBeLessThan(0.1);
      expect(cubic(part.path).length / curve.length).toBeCloseTo(1 - 2 * DETACHED_END_TRIM, 2);
      expect([part.labelX, part.labelY]).toEqual([whole.labelX, whole.labelY]);
    },
  );

  /** `selfEdgeAttachment`'s loop: Right leaving, Top entering, round the corner. */
  const self: EdgeAttachment = {
    sourceX: 206,
    sourceY: 50,
    sourcePosition: Position.Right,
    targetX: 100,
    targetY: -6,
    targetPosition: Position.Top,
  };

  it('keeps a self-Edge’s lane anchors on the sides they sit on, away from the corner', () => {
    const [x1, y1, , , , , x2, y2] = numbers(laneBezier(self, GRAPH_LANE_SPACING).path);

    expect([x1, y1]).toEqual([self.sourceX, self.sourceY + GRAPH_LANE_SPACING]);
    expect([x2, y2]).toEqual([self.targetX - GRAPH_LANE_SPACING, self.targetY]);
  });

  it('draws a short Edge forwards between Resources close together', () => {
    const close: EdgeAttachment = { ...level, sourceX: 100, targetX: 112 };
    const [x1, , , , , , x2] = numbers(
      laneBezier(close, GRAPH_LANE_SPACING, DETACHED_END_TRIM).path,
    );

    expect(x1).toBeGreaterThan(close.sourceX);
    expect(x2).toBeLessThan(close.targetX);
    expect(x1).toBeLessThan(x2!);
  });
});

/**
 * A lane's distance from the centre curve, as properties over attachments on
 * either axis and either direction, steep ones included — Resources far apart
 * across the facing axis, where a curve turns toward the direction a lane is
 * moved.
 */
describe('laneBezier keeps its distance', () => {
  /**
   * An attachment on one axis, leaving the source towards `forwards` or back,
   * with the target `ahead` of the source along the direction it leaves in —
   * behind it where `ahead` is negative — and `across` it on the other axis.
   */
  const attachmentOf = ({
    horizontal,
    forwards,
    ahead,
    across,
  }: {
    horizontal: boolean;
    forwards: boolean;
    ahead: number;
    across: number;
  }): EdgeAttachment => {
    const [from, to] = forwards
      ? horizontal
        ? [Position.Right, Position.Left]
        : [Position.Bottom, Position.Top]
      : horizontal
        ? [Position.Left, Position.Right]
        : [Position.Top, Position.Bottom];
    const step = forwards ? ahead : -ahead;
    return {
      sourceX: 100,
      sourceY: 100,
      sourcePosition: from,
      targetX: 100 + (horizontal ? step : across),
      targetY: 100 + (horizontal ? across : step),
      targetPosition: to,
    };
  };

  /** Attachments whose target lies well ahead of the source. */
  const attachmentArb = fc
    .record({
      horizontal: fc.boolean(),
      forwards: fc.boolean(),
      ahead: fc.integer({ min: 60, max: 600 }),
      across: fc.integer({ min: -900, max: 900 }),
    })
    .map(attachmentOf);

  /** Attachments of every kind: target ahead, level on the facing axis, or behind. */
  const anyAttachmentArb = fc
    .record({
      horizontal: fc.boolean(),
      forwards: fc.boolean(),
      ahead: fc.integer({ min: -600, max: 600 }),
      across: fc.integer({ min: -900, max: 900 }),
    })
    .map(attachmentOf);

  const offsetArb = fc
    .tuple(fc.integer({ min: 1, max: 3 }), fc.boolean())
    .map(([spacings, negative]) => (negative ? -1 : 1) * spacings * GRAPH_LANE_SPACING);

  type Point = readonly [number, number];

  /** Points along every cubic of an `M x,y C … C …` path. */
  const samples = (path: string, perCubic: number): Point[] => {
    const n = numbers(path);
    const points: Point[] = [];
    for (let i = 2; i + 6 <= n.length; i += 6) {
      const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = n.slice(i - 2, i + 6);
      for (let s = 0; s <= perCubic; s += 1) {
        const t = s / perCubic;
        const u = 1 - t;
        const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
        points.push([
          w[0] * a + w[1] * c + w[2] * e + w[3] * g,
          w[0] * b + w[1] * d + w[2] * f + w[3] * h,
        ]);
      }
    }
    return points;
  };

  /**
   * Where on the one cubic a path draws a point comes nearest it, and how near:
   * the nearest of a coarse sampling, then narrowed between its neighbours. It
   * reads only the path's first cubic, so it is for the lone curve, never for a
   * lane.
   */
  const footOn = (path: string) => {
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = numbers(path);
    const point = (t: number): Point => {
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
      return [w[0] * a + w[1] * c + w[2] * e + w[3] * g, w[0] * b + w[1] * d + w[2] * f + w[3] * h];
    };
    const coarse = 500;
    return ([x, y]: Point) => {
      const away = (t: number) => {
        const [px, py] = point(t);
        return Math.hypot(px - x, py - y);
      };
      let [best, bestAway] = [0, away(0)];
      for (let i = 1; i <= coarse; i += 1) {
        const distance = away(i / coarse);
        if (distance < bestAway) [best, bestAway] = [i, distance];
      }
      let [low, high] = [Math.max(0, best - 1) / coarse, Math.min(coarse, best + 1) / coarse];
      for (let i = 0; i < 40; i += 1) {
        const [one, two] = [low + (high - low) / 3, high - (high - low) / 3];
        if (away(one) < away(two)) high = two;
        else low = one;
      }
      const t = (low + high) / 2;
      return { t, distance: away(t) };
    };
  };

  /** How near a point comes to the one cubic a path draws; see `footOn`. */
  const distanceFrom = (path: string) => {
    const foot = footOn(path);
    return (point: Point): number => foot(point).distance;
  };

  /**
   * How far inside its span a sample of a lane must sit, by where it comes
   * nearest the curve, to be the offset rather than a bridge arriving at it.
   */
  const SPAN_MARGIN = 0.01;

  it('runs every point of a lane inside its span at its offset from the centre curve', () => {
    fc.assert(
      fc.property(attachmentArb, offsetArb, (attachment, offset) => {
        const span = laneSpan(attachment, Math.abs(offset));
        fc.pre(span !== undefined);
        const [t0, t1] = span;
        const foot = footOn(getBezierPath(attachment)[0]);
        for (const point of samples(laneBezier(attachment, offset).path, 10)) {
          const { t, distance } = foot(point);
          if (t < t0 + SPAN_MARGIN || t > t1 - SPAN_MARGIN) continue;
          expect(Math.abs(distance - Math.abs(offset))).toBeLessThan(0.5);
        }
      }),
    );
  });

  /**
   * The nearest any point of a lane's middle comes to the centre curve. The
   * ends are left out: every lane starts and ends beside its anchor, so they say
   * nothing about the order the lanes run in between.
   */
  const nearestApproach = (attachment: EdgeAttachment, offset: number, reach: number): number => {
    const nearest = distanceFrom(getBezierPath(attachment)[0]);
    const points = samples(laneBezier(attachment, offset, 0, reach).path, 40);
    return Math.min(...points.slice(5, -5).map(nearest));
  };

  it('keeps a pair’s lanes in order where the outer ones cannot be offset', () => {
    // The whole curve can be offset by 8 and not by 16, so at the pair's reach
    // of 16 both lanes are offset over a span of it and bridged at the ends.
    const attachment = right(120, 200);
    const [inner, outer] = [GRAPH_LANE_SPACING, 2 * GRAPH_LANE_SPACING].map((offset) =>
      nearestApproach(attachment, offset, 2 * GRAPH_LANE_SPACING),
    );

    expect(outer).toBeGreaterThan(inner! + 1);
  });

  it('runs each further lane of a pair further from the centre curve', () => {
    fc.assert(
      fc.property(attachmentArb, fc.integer({ min: 2, max: 4 }), (attachment, count) => {
        const reach = count * GRAPH_LANE_SPACING;
        const approaches = Array.from({ length: count }, (_, lane) =>
          nearestApproach(attachment, (lane + 1) * GRAPH_LANE_SPACING, reach),
        );
        approaches.slice(1).forEach((approach, lane) => {
          expect(approach).toBeGreaterThan(approaches[lane]!);
        });
      }),
    );
  });

  it('starts and ends a lane beside its anchors, on the side each sits on', () => {
    fc.assert(
      fc.property(attachmentArb, offsetArb, (attachment, offset) => {
        const n = numbers(laneBezier(attachment, offset).path);
        const [x1, y1] = [n[0]!, n[1]!];
        const [x2, y2] = [n[n.length - 2]!, n[n.length - 1]!];
        const horizontal =
          attachment.sourcePosition === Position.Left ||
          attachment.sourcePosition === Position.Right;
        const [dx, dy] = horizontal ? [0, offset] : [offset, 0];

        expect(x1).toBeCloseTo(attachment.sourceX + dx, 6);
        expect(y1).toBeCloseTo(attachment.sourceY + dy, 6);
        expect(x2).toBeCloseTo(attachment.targetX + dx, 6);
        expect(y2).toBeCloseTo(attachment.targetY + dy, 6);
      }),
    );
  });

  /** Which coordinate runs along the facing axis, and which way the source leaves along it. */
  const facing = (attachment: EdgeAttachment) => {
    switch (attachment.sourcePosition) {
      case Position.Right:
        return [0, 1] as const;
      case Position.Left:
        return [0, -1] as const;
      case Position.Bottom:
        return [1, 1] as const;
      case Position.Top:
        return [1, -1] as const;
    }
  };

  /** How far along the facing axis a point is, in the direction the source leaves. */
  const alongOf = (attachment: EdgeAttachment) => {
    const [axis, direction] = facing(attachment);
    return (point: readonly number[]): number => point[axis]! * direction;
  };

  /**
   * How far along the facing axis a lane may stray, back between samples or
   * past the lone curve's ends: an offset lane is cubics that follow the true
   * offset closely rather than exactly, and may wobble by a hair. A lane that
   * doubles back strays by units, not by this.
   */
  const WOBBLE = 0.05;

  /** The furthest back and furthest forward the lone curve runs along the facing axis. */
  const alongRange = (attachment: EdgeAttachment): [number, number] => {
    const along = samples(getBezierPath(attachment)[0], 2000).map(alongOf(attachment));
    return [Math.min(...along), Math.max(...along)];
  };

  /**
   * Every point of a lane — trimmed or not — and its label, as far along the
   * facing axis as the lone curve runs and no further: never behind where the
   * lone curve starts or past where it ends.
   */
  const expectWithinTheCurve = (attachment: EdgeAttachment, offset: number, endTrim: number) => {
    const [back, forward] = alongRange(attachment);
    const along = alongOf(attachment);
    const lane = laneBezier(attachment, offset, endTrim);
    for (const point of [...samples(lane.path, 40), [lane.labelX, lane.labelY]]) {
      expect(along(point)).toBeGreaterThanOrEqual(back - WOBBLE);
      expect(along(point)).toBeLessThanOrEqual(forward + WOBBLE);
    }
  };

  /** Every point of a lane further along the facing axis than the one before it, or level. */
  const expectForwards = (attachment: EdgeAttachment, offset: number, endTrim: number) => {
    const along = samples(laneBezier(attachment, offset, endTrim).path, 40).map(
      alongOf(attachment),
    );
    along.slice(1).forEach((value, index) => {
      expect(value).toBeGreaterThanOrEqual(along[index]! - WOBBLE);
    });
  };

  const right = (dx: number, dy: number): EdgeAttachment =>
    attachmentOf({ horizontal: true, forwards: true, ahead: dx, across: dy });

  it.each([
    ['a tight bend', right(20, 200), 16, 0],
    ['a tight bend, trimmed', right(20, 200), 16, DETACHED_END_TRIM],
    ['Resources close together', right(4, 60), 16, DETACHED_END_TRIM],
  ] as const)(
    'keeps a lane between its anchors and running forwards on %s',
    (_, attachment, offset, endTrim) => {
      expectWithinTheCurve(attachment, offset, endTrim);
      expectForwards(attachment, offset, endTrim);
    },
  );

  /** Points along a path, about `total` of them however many cubics it draws. */
  const densely = (path: string, total: number): Point[] =>
    samples(path, Math.ceil(total / Math.max(1, (numbers(path).length - 2) / 6)));

  /** How wide a square of the plane `gapBetween` files segments under. */
  const GAP_CELL = 8;

  /**
   * How near two paths come to each other, point of one to segment of the
   * other. Segments are filed by the squares they cross, so each point looks
   * only as far out, a ring of squares at a time, as the nearest found so far.
   */
  const gapBetween = (one: string, other: string): number => {
    const line = densely(other, 800);
    const cells = new Map<string, number[]>();
    const cellOf = (value: number) => Math.floor(value / GAP_CELL);
    for (let i = 1; i < line.length; i += 1) {
      const [[ax, ay], [bx, by]] = [line[i - 1]!, line[i]!];
      for (let x = cellOf(Math.min(ax, bx)); x <= cellOf(Math.max(ax, bx)); x += 1) {
        for (let y = cellOf(Math.min(ay, by)); y <= cellOf(Math.max(ay, by)); y += 1) {
          const key = `${x},${y}`;
          cells.set(key, [...(cells.get(key) ?? []), i]);
        }
      }
    }
    const toSegment = ([x, y]: Point, i: number): number => {
      const [[ax, ay], [bx, by]] = [line[i - 1]!, line[i]!];
      const [ux, uy] = [bx - ax, by - ay];
      const squared = ux * ux + uy * uy;
      const s =
        squared === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * ux + (y - ay) * uy) / squared));
      return Math.hypot(ax + ux * s - x, ay + uy * s - y);
    };
    let gap = Infinity;
    for (const point of densely(one, 800)) {
      const [cx, cy] = [cellOf(point[0]), cellOf(point[1])];
      for (let ring = 0; (ring - 1) * GAP_CELL < gap; ring += 1) {
        for (let x = cx - ring; x <= cx + ring; x += 1) {
          const edge = x === cx - ring || x === cx + ring;
          for (let y = cy - ring; y <= cy + ring; y += edge ? 1 : 2 * ring) {
            for (const i of cells.get(`${x},${y}`) ?? []) gap = Math.min(gap, toSegment(point, i));
          }
        }
      }
    }
    return gap;
  };

  /** The nearest any lane of a pair comes to the lane inside it. */
  const narrowestGap = (paths: readonly string[]): number =>
    Math.min(...paths.slice(1).map((path, lane) => gapBetween(path, paths[lane]!)));

  it('keeps lanes apart through a steep middle between anchors close along the facing axis', () => {
    const attachment = right(100, 300);
    const offsets = [0, 8, 16, 24];
    const nearest = distanceFrom(getBezierPath(attachment)[0]);

    expect(
      narrowestGap(offsets.map((offset) => laneBezier(attachment, offset, 0, 24).path)),
    ).toBeGreaterThan(4.5);
    for (const offset of offsets.slice(1)) {
      for (const point of samples(laneBezier(attachment, offset, DETACHED_END_TRIM, 24).path, 40)) {
        expect(Math.abs(nearest(point) - offset)).toBeLessThan(0.5);
      }
    }
  });

  /** The lanes of a pair: the centre and those beside it, or both directions split about it. */
  const pairArb = fc
    .tuple(fc.integer({ min: 2, max: 4 }), fc.boolean())
    .map(([count, split]) =>
      Array.from({ length: count }, (_, lane) => (lane - (split ? 1 / 2 : 0)) * GRAPH_LANE_SPACING),
    );

  /** A lane as ADR 0100 drew it: `getBezierPath` over both anchors moved along their sides. */
  const movedWhole = (attachment: EdgeAttachment, offset: number): string => {
    const horizontal =
      attachment.sourcePosition === Position.Left || attachment.sourcePosition === Position.Right;
    const [dx, dy] = horizontal ? [0, offset] : [offset, 0];
    return getBezierPath({
      ...attachment,
      sourceX: attachment.sourceX + dx,
      sourceY: attachment.sourceY + dy,
      targetX: attachment.targetX + dx,
      targetY: attachment.targetY + dy,
    })[0];
  };

  it('never runs a lane nearer its neighbour than the same lanes moved whole', () => {
    fc.assert(
      fc.property(
        fc
          .record({
            horizontal: fc.boolean(),
            forwards: fc.boolean(),
            ahead: fc.integer({ min: 10, max: 600 }),
            across: fc.integer({ min: -900, max: 900 }),
          })
          .map(attachmentOf),
        pairArb,
        (attachment, offsets) => {
          const reach = Math.max(...offsets.map(Math.abs));
          const lanes = offsets.map((offset) => laneBezier(attachment, offset, 0, reach).path);
          const moved = offsets.map((offset) => movedWhole(attachment, offset));
          expect(narrowestGap(lanes)).toBeGreaterThanOrEqual(narrowestGap(moved) - 0.05);
        },
      ),
    );
  });

  it.each([
    [
      'Right to Left',
      right(300, 120),
      16,
      24,
      'M100,116 C117.83868036953166,116 132.4916524186643,117.67462537704372 146.30735473606433,120.76934269614134 C159.95198503670454,123.82573988348474 171.13282802151275,127.89150096886955 182.13880291864365,133.17436891949237 C203.93045612111973,143.6343624566809 221.25487923912922,157.49390095108848 240.00487923912922,172.49390095108848 C258.7548792391292,187.49390095108848 278.9304561211197,203.63436245668086 304.01380291864365,215.67436891949237 C316.4453280215128,221.64150096886954 331.0457350367046,226.95073988348477 346.6979797360643,230.45684269614134 C362.17915241866416,233.9246253770437 380.3386803695318,236 400,236',
    ],
    [
      'Top to Bottom',
      attachmentOf({ horizontal: false, forwards: false, ahead: 200, across: -60 }),
      -8,
      16,
      'M92,100 C92,75.79215610874226 88.52179395553513,58.401125886417894 83.09790070505018,43.33475574618193 C77.73775613869043,28.445465284071496 70.64005659429965,16.61596604342021 63.140056594299644,4.1159660434202126 C55.640056594299644,-8.384033956579788 47.73775613869045,-21.554534715928444 41.847900705050186,-37.91524425381807 C36.02179395553512,-54.09887411358215 32,-74.20784389125774 32,-100',
    ],
  ] as const)(
    'draws a %s lane the curve bends gently along as the offset of the whole curve, as before',
    (_, attachment, offset, reach, path) => {
      expect(laneSpan(attachment, reach)).toEqual([0, 1]);
      expect(laneBezier(attachment, offset, 0, reach).path).toBe(path);
    },
  );

  it('keeps a lane between Resources whose target sits behind the source no further out than the curve', () => {
    expectWithinTheCurve(right(-40, 30), GRAPH_LANE_SPACING, DETACHED_END_TRIM);
  });

  it('moves a lane between anchors level on the facing axis whole, along the sides', () => {
    const attachment = right(0, 200);
    const lone = numbers(laneBezier(attachment, 0).path);
    const laned = numbers(laneBezier(attachment, GRAPH_LANE_SPACING).path);

    expect(laned).toHaveLength(lone.length);
    laned.forEach((value, index) => {
      expect(value - lone[index]!).toBeCloseTo(index % 2 === 0 ? 0 : GRAPH_LANE_SPACING);
    });
  });

  it('never draws a lane further along the facing axis than the lone curve runs', () => {
    fc.assert(
      fc.property(
        anyAttachmentArb,
        offsetArb,
        fc.constantFrom(0, DETACHED_END_TRIM),
        expectWithinTheCurve,
      ),
    );
  });

  it('draws a lane forwards wherever the lone curve runs forwards', () => {
    fc.assert(
      fc.property(
        anyAttachmentArb.filter((attachment) => {
          const along = alongOf(attachment);
          return along([attachment.targetX, attachment.targetY]) >= along([100, 100]);
        }),
        offsetArb,
        fc.constantFrom(0, DETACHED_END_TRIM),
        expectForwards,
      ),
    );
  });
});
