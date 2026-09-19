import { getBezierPath, Position } from '@xyflow/react';

import type { EdgeAttachment } from './edge-attachment';

/**
 * How far apart, in flow units, two neighbouring lanes run.
 *
 * Enough to clear a 3-unit stroke with a visible gap, close enough that a
 * bundle of a Diagram's few Graphs reads as one connection.
 */
export const GRAPH_LANE_SPACING = 8;

/** The one Edge fact lanes are decided from: which Things it joins. */
export interface LaneEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

/**
 * How far from the centre line each Edge is drawn, keyed by Edge id.
 *
 * Every Edge joins two Things, and each attaches from where those Things are
 * (ADR 0087) rather than from which Graph it belongs to, so every Graph's Edge
 * between the same pair lands on the same two anchors and draws the same curve.
 * Edges sharing a pair — in either direction — are therefore given lanes in the
 * order they arrive: the first keeps the centre, and each after it runs one
 * spacing further out on the same side. A caller that wants one Edge on the
 * centre — the Active Graph's — puts it first.
 *
 * The distance carries no direction: which side is "out" is the screen's, not
 * the Edge's (see `laneBezier`), so an Edge and its reverse stack the same way.
 * A lone Edge's offset is zero.
 */
export function laneOffsets(edges: readonly LaneEdge[]): Map<string, number> {
  const bundles = new Map<string, LaneEdge[]>();
  for (const edge of edges) {
    const key = pairKey(edge);
    const bundle = bundles.get(key);
    if (bundle === undefined) bundles.set(key, [edge]);
    else bundle.push(edge);
  }

  const offsets = new Map<string, number>();
  for (const bundle of bundles.values()) {
    bundle.forEach((edge, lane) => offsets.set(edge.id, lane * GRAPH_LANE_SPACING));
  }
  return offsets;
}

const pairKey = ({ source, target }: LaneEdge): string =>
  source <= target ? `${source}|${target}` : `${target}|${source}`;

/** An Edge's drawn path and the point a label or toolbar sits at. */
export interface LaneGeometry {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
}

/**
 * How much of its length an Edge that is not the Active Graph's leaves undrawn
 * at each end, as a fraction. The Active Graph's Edge is the one that connects;
 * the others run beside it as a reading of which Graphs also join the pair.
 */
export const DETACHED_END_TRIM = 0.2;

/**
 * The Edge a lane draws: the lone Edge's own curve, moved sideways, with
 * `endTrim` of its length left undrawn at each end.
 *
 * Each anchor moves along the side of the Thing it sits on, and the curve
 * between them is `getBezierPath` over the moved anchors. Where the two sides
 * are on one axis both anchors move by the same vector, and React Flow places
 * its control points relative to the anchors, so the curve is an exact
 * translate of the lone one — a straight Edge's lanes are straight lines beside
 * it, and a curved Edge's lanes are the same curve beside it. The arrowheads
 * move with their lanes rather than meeting on one point.
 *
 * A lane runs below an Edge whose sides are left and right, and to the right
 * of one whose sides are top and bottom — along the side the anchors sit on,
 * whichever way the Edge travels. A self-Edge's two sides are on different
 * axes, so no one vector keeps both anchors on their sides: each anchor moves
 * along its own side, away from the corner the loop goes round, so an
 * arrowhead still lands on its Thing. The lane is then a loop of its own
 * rather than a translate, and the lanes are not kept from crossing.
 *
 * The trim cuts that same curve rather than moving its ends, so what is drawn
 * is the middle of the curve a connecting Edge would draw, whatever its shape
 * and however close its Things. It is measured along the curve, so both ends
 * lose the same length, and the midpoint the label sits at does not move.
 */
export function laneBezier(attachment: EdgeAttachment, offset: number, endTrim = 0): LaneGeometry {
  const [sdx, sdy, tdx, tdy] = laneMoves(attachment, offset);
  const [path, labelX, labelY] = getBezierPath({
    ...attachment,
    sourceX: attachment.sourceX + sdx,
    sourceY: attachment.sourceY + sdy,
    targetX: attachment.targetX + tdx,
    targetY: attachment.targetY + tdy,
  });
  const curve = endTrim > 0 ? cubicOf(path) : undefined;
  if (curve === undefined) return { path, labelX, labelY };
  return { path: pathOf(trimmed(curve, endTrim)), labelX, labelY };
}

type Point = readonly [number, number];
type Cubic = readonly [Point, Point, Point, Point];

/**
 * The four points of the one cubic `getBezierPath` draws, read back from its
 * `M x,y C x,y x,y x,y` path — React Flow does not export the control points
 * it chooses, and reading them keeps it the one author of the curve's shape.
 */
function cubicOf(path: string): Cubic | undefined {
  const n = (path.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  if (n.length !== 8) return undefined;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = n;
  return [
    [a, b],
    [c, d],
    [e, f],
    [g, h],
  ];
}

const pathOf = ([p0, p1, p2, p3]: Cubic): string =>
  `M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`;

const lerp = (p: Point, q: Point, t: number): Point => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
];

/** The curve split at `t` into the part before it and the part after. */
function split([p0, p1, p2, p3]: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const ab = lerp(a, b, t);
  const bc = lerp(b, c, t);
  const mid = lerp(ab, bc, t);
  return [
    [p0, a, ab, mid],
    [mid, bc, c, p3],
  ];
}

const at = (curve: Cubic, t: number): Point => split(curve, t)[0][3];

/** Enough straight pieces that a curve's measured length is within a hair of its own. */
const LENGTH_SAMPLES = 64;

/** The curve with `fraction` of its length removed from each end. */
function trimmed(curve: Cubic, fraction: number): Cubic {
  const lengths = [0];
  let previous = curve[0];
  for (let i = 1; i <= LENGTH_SAMPLES; i += 1) {
    const point = at(curve, i / LENGTH_SAMPLES);
    lengths.push(
      (lengths[i - 1] ?? 0) + Math.hypot(point[0] - previous[0], point[1] - previous[1]),
    );
    previous = point;
  }
  const total = lengths[LENGTH_SAMPLES] ?? 0;
  if (total === 0) return curve;

  // The parameter at which the curve has run `length`, between two samples.
  const parameterAt = (length: number): number => {
    const i = lengths.findIndex((sample) => sample >= length);
    if (i <= 0) return 0;
    const before = lengths[i - 1] ?? 0;
    const after = lengths[i] ?? before;
    const within = after === before ? 0 : (length - before) / (after - before);
    return (i - 1 + within) / LENGTH_SAMPLES;
  };
  const start = parameterAt(total * fraction);
  const end = parameterAt(total * (1 - fraction));
  const [head] = split(curve, end);
  return split(head, start / end)[1];
}

/** A distance along the direction a side of a Thing faces. */
function outward(side: Position, distance: number): [number, number] {
  switch (side) {
    case Position.Left:
      return [-distance, 0];
    case Position.Right:
      return [distance, 0];
    case Position.Top:
      return [0, -distance];
    case Position.Bottom:
      return [0, distance];
  }
}

const HORIZONTAL = new Set([Position.Left, Position.Right]);

/** How far, and which way on the screen, a lane moves the source and target. */
function laneMoves(attachment: EdgeAttachment, offset: number): [number, number, number, number] {
  const { sourcePosition, targetPosition } = attachment;
  const horizontal = HORIZONTAL.has(sourcePosition);
  if (horizontal !== HORIZONTAL.has(targetPosition)) {
    return [
      ...alongSideFromCorner(sourcePosition, targetPosition, offset),
      ...alongSideFromCorner(targetPosition, sourcePosition, offset),
    ];
  }
  return horizontal ? [0, offset, 0, offset] : [offset, 0, offset, 0];
}

/**
 * A distance along `side`, away from the corner it shares with `other`: along
 * a side is across the direction it faces, and away from the corner is against
 * the direction the other side faces.
 */
function alongSideFromCorner(side: Position, other: Position, distance: number): [number, number] {
  const [ox, oy] = outward(other, distance);
  return HORIZONTAL.has(side) ? [0, -oy] : [-ox, 0];
}
