import { getBezierPath, Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import type { GraphId } from '@project/core';

import type { EdgeAttachment } from '../src/edge-attachment';
import {
  DETACHED_END_TRIM,
  GRAPH_LANE_SPACING,
  graphLanes,
  laneBezier,
  type GraphLane,
} from '../src/edge-lanes';
import { uuid } from './uuid';

describe('graphLanes', () => {
  const [RED, BLUE] = ['1', '2'].map((id) => uuid(`00000000-0000-4000-8000-00000000020${id}`));
  const edge = (graphId: GraphId, source: string, target: string) => ({
    id: `${graphId}::${source}::${target}`,
    graphId,
    source,
    target,
  });
  const offsets = (lanes: Map<string, GraphLane>) => [...lanes.values()].map((l) => l.offset);

  it('leaves a lone Edge on the centre line', () => {
    expect(graphLanes([edge(RED!, 'a', 'b')], null)).toEqual(
      new Map([[`${RED}::a::b`, { offset: 0, connects: true }]]),
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

    expect(lanes.get(`${BLUE}::a::b`)).toEqual({ offset: 0, connects: true });
    expect(lanes.get(`${RED}::a::b`)).toEqual({ offset: GRAPH_LANE_SPACING, connects: false });
  });

  it('keeps the centre for another Graph where the Active Graph has no Edge in the pair', () => {
    const lanes = graphLanes([edge(RED!, 'a', 'b')], BLUE!);

    expect(lanes.get(`${RED}::a::b`)).toEqual({ offset: 0, connects: false });
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

  const numbers = (path: string): number[] =>
    (path.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

  it('is React Flow’s own bezier for a lone Edge', () => {
    const [path, labelX, labelY] = getBezierPath(level);
    expect(laneBezier(level, 0)).toEqual({ path, labelX, labelY });
  });

  /**
   * Parallel is the whole requirement: every point of the lane's path —
   * anchors, control points and all — is the lone path's point moved by one
   * vector, so a straight Edge's lanes are straight and a curve's lanes are
   * that curve.
   */
  it.each([
    ['level', level, [0, 8]],
    ['stacked', stacked, [8, 0]],
    ['reversed', reversed, [0, 8]],
  ] as const)('moves a %s Edge whole, below or right of it', (_, attachment, [dx, dy]) => {
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

  /** A point `t` along the cubic a path draws, and how long that cubic is. */
  const cubic = (path: string) => {
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = numbers(path);
    const point = (t: number): [number, number] => {
      const u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
      return [w[0] * a + w[1] * c + w[2] * e + w[3] * g, w[0] * b + w[1] * d + w[2] * f + w[3] * h];
    };
    let length = 0;
    for (let i = 1; i <= 1000; i += 1) {
      const [x0, y0] = point((i - 1) / 1000);
      const [x1, y1] = point(i / 1000);
      length += Math.hypot(x1 - x0, y1 - y0);
    }
    const distanceTo = ([x, y]: readonly number[]): number =>
      Math.min(
        ...Array.from({ length: 20_001 }, (_, i) => {
          const [px, py] = point(i / 20_000);
          return Math.hypot(px - x!, py - y!);
        }),
      );
    return { length, distanceTo };
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
      const [x1, y1, , , , , x2, y2] = numbers(part.path);

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

  it('draws a short Edge forwards between Things close together', () => {
    const close: EdgeAttachment = { ...level, sourceX: 100, targetX: 112 };
    const [x1, , , , , , x2] = numbers(
      laneBezier(close, GRAPH_LANE_SPACING, DETACHED_END_TRIM).path,
    );

    expect(x1).toBeGreaterThan(close.sourceX);
    expect(x2).toBeLessThan(close.targetX);
    expect(x1).toBeLessThan(x2!);
  });
});
