import { getBezierPath, Position } from '@xyflow/react';

import type { GraphId } from '@project/core';

import type { EdgeAttachment } from './edge-attachment';

/**
 * How far apart, in flow units, two neighbouring lanes run.
 *
 * Enough to clear a 3-unit stroke with a visible gap, close enough that a
 * bundle of a Map's few Graphs reads as one connection.
 */
export const GRAPH_LANE_SPACING = 8;

/** The Edge facts lanes are decided from: which Resources it joins, and for which Graph. */
export interface LaneEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly graphId: GraphId;
}

/** Where an Edge is drawn beside the others joining its pair, and whether it connects. */
export interface GraphLane {
  /** How far from the centre line the Edge runs, and to which side. Zero for a lone Edge. */
  readonly offset: number;
  /**
   * How far from the centre line the outermost lane of this Edge's pair runs,
   * to either side. Every lane of a pair is drawn the same way — offset along
   * the same stretch of the curve, or the curve moved whole — decided at this
   * distance, so the lanes never run out of order (ADR 0103).
   */
  readonly reach: number;
  /**
   * Whether the Edge runs anchor to anchor rather than stopping short. The
   * Active Graph's Edges connect, and while no Graph is active every Edge does;
   * any other Edge runs beside them and stops short (ADR 0100).
   */
  readonly connects: boolean;
}

/**
 * The lane of every Edge, keyed by Edge id.
 *
 * Every Edge joins two Resources, and each attaches from where those Resources are
 * (ADR 0087) rather than from which Graph it belongs to, so every Graph's Edge
 * between the same pair lands on the same two anchors and draws the same curve.
 * Edges sharing a pair — in either direction — are therefore given lanes. The
 * Active Graph's Edges are centred on the anchors: its one Edge takes the
 * centre, and where it holds both directions they sit half a spacing either
 * side of it, the one whose source sorts first on the negative side. Each other
 * Edge runs one spacing further out on the positive side, in the order the
 * Edges are given; where the Active Graph has no Edge in the pair, the first of
 * them keeps the centre.
 *
 * The offset's sign is the screen's, not the Edge's (see `laneBezier`), so an
 * Edge and its reverse stack the same way.
 */
export function graphLanes(
  edges: readonly LaneEdge[],
  activeGraphId: GraphId | null,
): ReadonlyMap<string, GraphLane> {
  const bundles = new Map<string, LaneEdge[]>();
  for (const edge of edges) {
    const key = pairKey(edge);
    const bundle = bundles.get(key);
    if (bundle === undefined) bundles.set(key, [edge]);
    else bundle.push(edge);
  }

  const isActive = (edge: LaneEdge) => edge.graphId === activeGraphId;
  const lanes = new Map<string, GraphLane>();
  for (const bundle of bundles.values()) {
    // A Graph holds one Edge per direction, so the Active Graph has at most two
    // here, and they share the centre between them.
    const active = bundle
      .filter(isActive)
      .sort((left, right) => (left.source < right.source ? -1 : 1));
    const centre = (active.length - 1) / 2;
    const others = bundle.filter((edge) => !isActive(edge));
    const outermost = active.length === 0 ? -1 : centre;
    const reach = Math.max(centre, outermost + others.length) * GRAPH_LANE_SPACING;
    active.forEach((edge, lane) =>
      lanes.set(edge.id, {
        offset: (lane - centre) * GRAPH_LANE_SPACING,
        reach,
        connects: true,
      }),
    );
    others.forEach((edge, lane) =>
      lanes.set(edge.id, {
        offset: (outermost + 1 + lane) * GRAPH_LANE_SPACING,
        reach,
        connects: activeGraphId === null,
      }),
    );
  }
  return lanes;
}

const pairKey = ({ source, target }: LaneEdge): string =>
  source <= target ? `${source}|${target}` : `${target}|${source}`;

/** An Edge's drawn path, the point a label or toolbar sits at, and how far it reaches. */
export interface LaneGeometry {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
  /**
   * Straight distance between the drawn line's ends, after lane offset and
   * trim, excluding the head marker. A midpoint Title's room is measured
   * against it.
   */
  readonly span: number;
}

/**
 * How much of its length an Edge that is not the Active Graph's leaves undrawn
 * at each end, as a fraction. The Active Graph's Edge is the one that connects;
 * the others run beside it as a reading of which Graphs also join the pair.
 */
export const DETACHED_END_TRIM = 0.2;

/**
 * The Edge a lane draws: the lone Edge's own curve, offset along its normal by
 * `offset`, with `endTrim` of its length left undrawn at each end. `reach` is
 * how far out the outermost lane of the Edge's pair runs, and it is at that
 * distance that where the offset holds is judged: every lane of a pair is
 * offset over the same stretch of the curve, or every lane is moved whole,
 * since lanes judged apart would cross the lanes inside them.
 *
 * The lone curve is `getBezierPath` over the unmoved anchors, so React Flow
 * stays the one author of its shape, and the lane runs at the same distance
 * from it at every point rather than being the curve moved whole: a moved copy
 * keeps its distance only where the curve runs across the move, and closes in
 * wherever the curve turns toward it (ADR 0103). A straight Edge's lanes are
 * straight lines beside it; a curved Edge's lanes bend with it, parallel
 * rather than fanned. The offset of a curved cubic is not itself a cubic, so
 * the lane is a run of cubics, each the offset of a piece of the lone curve by
 * Tiller and Hanson's construction, a piece being halved until its offset
 * holds the distance.
 *
 * An offset is drawn only where it stays a copy of the curve: over the widest
 * stretch around the curve's midpoint that bends no tighter than twice the
 * reach, and whose ends lie ahead of the anchors along the facing axis (see
 * `laneSpan`). React Flow's curve bends tightest right at its anchors where
 * the target is little ahead of the source and far across it, so there the
 * stretch stops short of them, and each end of the lane is one cubic bridging
 * from beside its anchor to the offset, running forwards. Where the curve
 * bends gently enough all along, the stretch is the whole curve and there are
 * no bridges. Where no stretch holds — the curve turns back against the
 * direction it leaves in, leaves an anchor other than along the side's facing
 * direction, or lies so little ahead that an offset at the reach would sit
 * behind a Resource — the lane is instead the curve moved whole: both anchors
 * move by one vector along their sides and the curve is `getBezierPath` over
 * the moved anchors.
 *
 * At a left, right, top or bottom anchor the curve leaves along the direction
 * the side faces, so its normal there is along the side, and each end of a
 * lane sits beside its anchor, moved along the side the anchor sits on. The
 * heads move with their lanes rather than meeting on one point.
 *
 * A positive offset runs below an Edge whose sides are left and right, and to
 * the right of one whose sides are top and bottom — along the side the anchors
 * sit on, whichever way the Edge travels; a negative one runs above or left. A
 * self-Edge's two sides are on different axes, so its lane is not an offset:
 * each anchor moves along its own side, away from the corner the loop goes
 * round, so a connecting Edge's head still lands on its Resource, and the curve between
 * them is `getBezierPath` over the moved anchors. The lane is then a loop of
 * its own, and the lanes are not kept from crossing.
 *
 * The trim cuts the lane rather than moving its ends, so what is drawn is the
 * middle of the curve a lane would draw, whatever its shape and however close
 * its Resources. It is measured along the lane, so both ends lose the same
 * length, and the midpoint the label sits at does not move.
 */
export function laneBezier(
  attachment: EdgeAttachment,
  offset: number,
  endTrim = 0,
  reach = Math.abs(offset),
): LaneGeometry {
  const lane = laneCurve(attachment, offset, reach);
  if (lane === undefined) {
    const [path, labelX, labelY] = getBezierPath(attachment);
    const span = Math.hypot(
      attachment.targetX - attachment.sourceX,
      attachment.targetY - attachment.sourceY,
    );
    return { path, labelX, labelY, span };
  }
  const { pieces, label } = lane;
  const drawn = endTrim > 0 ? trimmed(pieces, endTrim) : pieces;
  const start = drawn[0]?.[0] ?? label;
  const end = drawn[drawn.length - 1]?.[3] ?? label;
  return {
    path: pathOf(drawn),
    labelX: label[0],
    labelY: label[1],
    span: Math.hypot(end[0] - start[0], end[1] - start[1]),
  };
}

/**
 * The stretch of the lone curve, as parameters `[t0, t1]` from 0 at the source
 * to 1 at the target, that `laneBezier` draws every lane of a pair out to
 * `reach` as an offset of, bridging to it outside; nothing where it moves the
 * lanes whole instead.
 */
export function laneSpan(
  attachment: EdgeAttachment,
  reach: number,
): readonly [number, number] | undefined {
  const { sourcePosition, targetPosition } = attachment;
  if (HORIZONTAL.has(sourcePosition) !== HORIZONTAL.has(targetPosition)) return undefined;
  const centre = cubicOf(getBezierPath(attachment)[0]);
  if (centre === undefined) return undefined;
  return offsetSpan(centre, reach, outward(sourcePosition, 1), outward(targetPosition, -1));
}

type Point = readonly [number, number];
type Cubic = readonly [Point, Point, Point, Point];

/** The cubics a lane draws, joined end to end, and where its label sits. */
interface LaneCurve {
  readonly pieces: readonly Cubic[];
  readonly label: Point;
}

/**
 * The lane's cubics, or nothing where React Flow's path cannot be read back as
 * one cubic — then the lone path is drawn as it is.
 */
function laneCurve(
  attachment: EdgeAttachment,
  offset: number,
  reach: number,
): LaneCurve | undefined {
  const { sourcePosition, targetPosition } = attachment;
  if (HORIZONTAL.has(sourcePosition) !== HORIZONTAL.has(targetPosition)) {
    return movedCurve(attachment, selfEdgeMoves(sourcePosition, targetPosition, offset));
  }

  const [path, labelX, labelY] = getBezierPath(attachment);
  const centre = cubicOf(path);
  if (centre === undefined) return undefined;
  if (offset === 0) return { pieces: [centre], label: [labelX, labelY] };
  const [dx, dy] = HORIZONTAL.has(sourcePosition) ? [0, offset] : [offset, 0];
  const start: Point = [attachment.sourceX + dx, attachment.sourceY + dy];
  const end: Point = [attachment.targetX + dx, attachment.targetY + dy];
  const leaves = outward(sourcePosition, 1);
  const arrives = outward(targetPosition, -1);
  const span = offsetSpan(centre, Math.max(reach, Math.abs(offset)), leaves, arrives);
  if (span === undefined) return movedCurve(attachment, [dx, dy, dx, dy]);

  const side = sideOf(sourcePosition);
  const [t0, t1] = span;
  const middle = offsetPieces(between(centre, t0, t1), offset, side, 0);
  const first = middle[0];
  const last = middle[middle.length - 1];
  if (first === undefined || last === undefined) return undefined;
  const pieces = [
    ...(t0 > 0 ? [bridge(start, leaves, first[0], unit(startTangent(first)))] : []),
    ...middle,
    ...(t1 < 1
      ? [reversed(bridge(end, negated(arrives), last[3], negated(unit(endTangent(last)))))]
      : []),
  ];
  // The ends are exactly where the anchor moved along its side would be, which
  // is where the offset puts them; stating it keeps rounding off the anchors.
  const ends = pieces.map(([p0, p1, p2, p3], index): Cubic => [
    index === 0 ? start : p0,
    p1,
    p2,
    index === pieces.length - 1 ? end : p3,
  ]);
  const label = offsetPoint(centre, 0.5, offset, side);
  return { pieces: ends, label };
}

/**
 * The lane as `getBezierPath` over anchors moved by `moves` — source then
 * target, each an x and a y.
 */
function movedCurve(
  attachment: EdgeAttachment,
  [sdx, sdy, tdx, tdy]: readonly [number, number, number, number],
): LaneCurve | undefined {
  const [path, labelX, labelY] = getBezierPath({
    ...attachment,
    sourceX: attachment.sourceX + sdx,
    sourceY: attachment.sourceY + sdy,
    targetX: attachment.targetX + tdx,
    targetY: attachment.targetY + tdy,
  });
  const curve = cubicOf(path);
  return curve === undefined ? undefined : { pieces: [curve], label: [labelX, labelY] };
}

/** Enough points along a curve to find its tightest bend. */
const BEND_SAMPLES = 64;

/** How many times a span's end is halved towards where it stops holding. */
const SPAN_REFINEMENTS = 24;

/**
 * The stretch `[t0, t1]` of the curve, around its midpoint, that every lane of
 * a pair out to `reach` either side draws as an offset, or nothing where no
 * lane can be offset at all.
 *
 * The curve must leave and arrive along its end legs, so its ends' normals lie
 * along the sides, and never turn back against the direction it leaves in,
 * where an offset would reach past the curve's own turn; either failing
 * anywhere leaves no span. Within the span it bends no tighter than twice the
 * reach: inside a bend tighter than the distance the offset doubles back on
 * itself, and inside one nearly that tight it turns a sharp corner rather than
 * a curve. There the offset runs forwards wherever the curve does. And the
 * offset at each end of the span lies ahead of the anchor it bridges to along
 * the facing axis, at the reach either side, so a bridge can run forwards to
 * it. Where the curve bends gently enough everywhere the span is the whole
 * curve, and there are no bridges.
 *
 * The span is decided from the curve and the reach alone, so every lane of a
 * pair lands at the same `t0` and `t1` and their offsets, on one normal, stay
 * in order.
 */
function offsetSpan(
  curve: Cubic,
  reach: number,
  leaves: Point,
  arrives: Point,
): readonly [number, number] | undefined {
  const [p0, p1, p2, p3] = curve;
  const [first, last] = [minus(p1, p0), minus(p3, p2)];
  if ((first[0] === 0 && first[1] === 0) || (last[0] === 0 && last[1] === 0)) return undefined;
  const bends = (t: number) => !(curvatureAt(curve, t) * Math.abs(reach) < 1 / 2);
  const holds: boolean[] = [];
  for (let i = 0; i <= BEND_SAMPLES; i += 1) {
    const t = i / BEND_SAMPLES;
    const [x, y] = tangentAt(curve, t);
    if (x * first[0] + y * first[1] < 0) return undefined;
    holds.push(!bends(t));
  }
  const middle = BEND_SAMPLES / 2;
  if (holds[middle] !== true) return undefined;

  // How far ahead of the anchor `from`, along `towards`, the nearer of the
  // offsets at the reach either side lies at `t`.
  const ahead = (t: number, from: Point, towards: Point) => {
    const [nx, ny] = normalOf(tangentAt(curve, t), 1) ?? [0, 0];
    const [x, y] = minus(at(curve, t), from);
    return x * towards[0] + y * towards[1] - Math.abs(reach * (nx * towards[0] + ny * towards[1]));
  };
  const fromStart = (t: number) => !bends(t) && ahead(t, p0, leaves) > 0;
  const fromEnd = (t: number) => !bends(t) && ahead(t, p3, negated(arrives)) > 0;

  let low = middle;
  while (low > 0 && holds[low - 1] === true) low -= 1;
  let high = middle;
  while (high < BEND_SAMPLES && holds[high + 1] === true) high += 1;
  const t0 = low === 0 ? 0 : spanEnd(fromStart, 0.5, (low - 1) / BEND_SAMPLES);
  const t1 = high === BEND_SAMPLES ? 1 : spanEnd(fromEnd, 0.5, (high + 1) / BEND_SAMPLES);
  return t0 === undefined || t1 === undefined ? undefined : [t0, t1];
}

/**
 * The furthest parameter from `inside` towards `outside` at which `holds` is
 * still true, halving the gap between them, or nothing where it fails at
 * `inside` itself. Nearer the curve's ends a span only fails more, so the
 * boundary is one crossing.
 */
function spanEnd(
  holds: (t: number) => boolean,
  inside: number,
  outside: number,
): number | undefined {
  if (!holds(inside)) return undefined;
  let [good, bad] = [inside, outside];
  for (let i = 0; i < SPAN_REFINEMENTS; i += 1) {
    const t = (good + bad) / 2;
    if (holds(t)) good = t;
    else bad = t;
  }
  return good;
}

/** How tightly a cubic bends at `t`, as one over the radius of the bend. */
function curvatureAt(curve: Cubic, t: number): number {
  const [p0, p1, p2, p3] = curve;
  const [x, y] = tangentAt(curve, t);
  const u = 1 - t;
  const bendX = u * (p2[0] - 2 * p1[0] + p0[0]) + t * (p3[0] - 2 * p2[0] + p1[0]);
  const bendY = u * (p2[1] - 2 * p1[1] + p0[1]) + t * (p3[1] - 2 * p2[1] + p1[1]);
  const speed = lengthOf([x, y]);
  // The curvature is |B' × B''| / |B'|³; with B' = 3·(x, y) and
  // B'' = 6·(bendX, bendY) that is ⅔·|(x, y) × (bend)| / |(x, y)|³.
  return (2 * Math.abs(x * bendY - y * bendX)) / (3 * speed * speed * speed);
}

/**
 * The one cubic from a lane's end beside its anchor to where its offset
 * begins: it leaves `from` along `leaving`, the direction the anchor's side
 * faces, and arrives at `to` along `arriving`, the offset's own direction
 * there. Each handle is no longer than a third of the chord, and short enough
 * that the control points run forwards along the facing axis, which keeps the
 * whole bridge running forwards.
 */
function bridge(from: Point, leaving: Point, to: Point, arriving: Point): Cubic {
  const chord = minus(to, from);
  const ahead = chord[0] * leaving[0] + chord[1] * leaving[1];
  const across = arriving[0] * leaving[0] + arriving[1] * leaving[1];
  const most = lengthOf(chord) / 3;
  const out = Math.min(most, ahead / 2);
  const back = Math.min(most, (ahead - out) / across);
  return [from, moved(from, leaving, out), moved(to, arriving, -back), to];
}

/** The part of a cubic between `t0` and `t1`. */
function between(curve: Cubic, t0: number, t1: number): Cubic {
  if (t0 === 0 && t1 === 1) return curve;
  const after = t0 === 0 ? curve : split(curve, t0)[1];
  return t1 === 1 ? after : split(after, (t1 - t0) / (1 - t0))[0];
}

/** A cubic drawn from its end to its start. */
const reversed = ([p0, p1, p2, p3]: Cubic): Cubic => [p3, p2, p1, p0];

const negated = ([x, y]: Point): Point => [-x, -y];

/** A direction of length one, or no direction for none. */
function unit(direction: Point): Point {
  const length = lengthOf(direction);
  return length === 0 ? [0, 0] : [direction[0] / length, direction[1] / length];
}

/**
 * Which way a positive offset turns from the direction of travel, read from
 * the side the Edge leaves: the normal is the tangent turned a quarter towards
 * below for left and right anchors, and towards the right for top and bottom.
 */
function sideOf(sourcePosition: Position): 1 | -1 {
  const [tx, ty] = outward(sourcePosition, 1);
  const [nx, ny] = HORIZONTAL.has(sourcePosition) ? [0, 1] : [1, 0];
  return -ty * nx + tx * ny >= 0 ? 1 : -1;
}

/** The unit normal to a direction, on the lane's side. */
function normalOf([x, y]: Point, side: 1 | -1): Point | undefined {
  const length = lengthOf([x, y]);
  if (length === 0) return undefined;
  return [(-y / length) * side, (x / length) * side];
}

const minus = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
const lengthOf = ([x, y]: Point): number => Math.sqrt(x * x + y * y);
const moved = (p: Point, normal: Point, distance: number): Point => [
  p[0] + normal[0] * distance,
  p[1] + normal[1] * distance,
];

/** The direction a cubic leaves its start, from the first control point that is not on it. */
const startTangent = ([p0, p1, p2, p3]: Cubic): Point =>
  [p1, p2, p3].map((p) => minus(p, p0)).find(([x, y]) => x !== 0 || y !== 0) ?? [0, 0];

/** The direction a cubic arrives at its end, from the last control point that is not on it. */
const endTangent = ([p0, p1, p2, p3]: Cubic): Point =>
  [p2, p1, p0].map((p) => minus(p3, p)).find(([x, y]) => x !== 0 || y !== 0) ?? [0, 0];

/** The tangent of a cubic at `t`. */
function tangentAt(curve: Cubic, t: number): Point {
  const [p0, p1, p2, p3] = curve;
  const u = 1 - t;
  const [a, b, c] = [u * u, 2 * u * t, t * t];
  const x = a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]);
  const y = a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1]);
  if (x !== 0 || y !== 0) return [x, y];
  // A control point on the end it belongs to stops the curve there; the
  // direction it leaves or arrives in is then the next control point's.
  return t < 0.5 ? startTangent(curve) : endTangent(curve);
}

/** The point `distance` along the normal from the curve at `t`. */
function offsetPoint(curve: Cubic, t: number, distance: number, side: 1 | -1): Point {
  const normal = normalOf(tangentAt(curve, t), side);
  const point = at(curve, t);
  return normal === undefined ? point : moved(point, normal, distance);
}

/** Where the lines through `p` along `u` and through `q` along `v` cross, if they do. */
function crossing(p: Point, u: Point, q: Point, v: Point): Point | undefined {
  const denominator = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(denominator) < 1e-9 * lengthOf(u) * lengthOf(v)) return undefined;
  const s = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / denominator;
  return [p[0] + u[0] * s, p[1] + u[1] * s];
}

/**
 * Tiller and Hanson's offset of one cubic: each leg of the control polygon
 * moved along its own normal, the moved legs crossed for the inner control
 * points, and the ends moved along the curve's own end normals. A leg of no
 * length takes its neighbour's normal, and where adjacent moved legs do not
 * cross — the legs parallel — the control point moves along its own leg's
 * normal.
 */
function tillerHanson(curve: Cubic, distance: number, side: 1 | -1): Cubic {
  const [p0, p1, p2, p3] = curve;
  const startNormal = normalOf(startTangent(curve), side) ?? [0, 0];
  const endNormal = normalOf(endTangent(curve), side) ?? startNormal;
  const legs = [minus(p1, p0), minus(p2, p1), minus(p3, p2)] as const;
  const first = normalOf(legs[0], side) ?? startNormal;
  const third = normalOf(legs[2], side) ?? endNormal;
  const middle = normalOf(legs[1], side);

  const inner = (point: Point, own: Point, leg: Point, other: Point): Point => {
    if (middle === undefined) return moved(point, own, distance);
    const zeroLeg = leg[0] === 0 && leg[1] === 0;
    const met = zeroLeg
      ? undefined
      : crossing(moved(point, own, distance), leg, moved(point, middle, distance), other);
    return met ?? moved(point, own, distance);
  };

  return [
    moved(p0, startNormal, distance),
    inner(p1, first, legs[0], legs[1]),
    inner(p2, third, legs[2], legs[1]),
    moved(p3, endNormal, distance),
  ];
}

/** How far from the true offset a piece's offset may stray before the piece is halved. */
const OFFSET_TOLERANCE = 0.2;

/** How many times a piece is halved at most. */
const OFFSET_DEPTH = 5;

/**
 * The offset of `curve`, as Tiller–Hanson offsets of its pieces: a piece whose
 * offset strays from the true offset at its quarter points is halved, and each
 * half offset in turn.
 */
function offsetPieces(curve: Cubic, distance: number, side: 1 | -1, depth: number): Cubic[] {
  const piece = tillerHanson(curve, distance, side);
  const strays = [0.25, 0.5, 0.75].some((t) => {
    const [x, y] = at(piece, t);
    const [ox, oy] = offsetPoint(curve, t, distance, side);
    return lengthOf([x - ox, y - oy]) > OFFSET_TOLERANCE;
  });
  if (!strays || depth >= OFFSET_DEPTH) return [piece];
  const [before, after] = split(curve, 0.5);
  return [
    ...offsetPieces(before, distance, side, depth + 1),
    ...offsetPieces(after, distance, side, depth + 1),
  ];
}

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

/** One path through cubics joined end to end. */
function pathOf(pieces: readonly Cubic[]): string {
  const [first] = pieces;
  if (first === undefined) return '';
  const moves = pieces.map(
    ([, p1, p2, p3]) => `C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`,
  );
  return `M${first[0][0]},${first[0][1]} ${moves.join(' ')}`;
}

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

/** The point `t` along a cubic. */
function at([p0, p1, p2, p3]: Cubic, t: number): Point {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

/** Enough straight pieces that a curve's measured length is within a hair of its own. */
const LENGTH_SAMPLES = 64;

/**
 * Cubics joined end to end with `fraction` of their whole length removed from
 * each end, measured along them.
 */
function trimmed(pieces: readonly Cubic[], fraction: number): readonly Cubic[] {
  // The length run by the end of each sample of each piece, from the start.
  const samples = Math.max(8, Math.ceil(LENGTH_SAMPLES / pieces.length));
  const lengths: number[][] = [];
  let total = 0;
  for (const piece of pieces) {
    const runs = [total];
    let previous = piece[0];
    for (let i = 1; i <= samples; i += 1) {
      const point = at(piece, i / samples);
      total += lengthOf(minus(point, previous));
      runs.push(total);
      previous = point;
    }
    lengths.push(runs);
  }
  if (total === 0) return pieces;

  // Which piece has run `length` by its end, and at what parameter within it.
  const positionAt = (length: number): [number, number] => {
    const index = Math.max(
      0,
      lengths.findIndex((runs) => (runs[samples] ?? 0) >= length),
    );
    const runs = lengths[index] ?? [0];
    const i = runs.findIndex((sample) => sample >= length);
    if (i <= 0) return [index, 0];
    const before = runs[i - 1] ?? 0;
    const after = runs[i] ?? before;
    const within = after === before ? 0 : (length - before) / (after - before);
    return [index, (i - 1 + within) / samples];
  };
  const [startIndex, start] = positionAt(total * fraction);
  const [endIndex, end] = positionAt(total * (1 - fraction));

  const kept = pieces.slice(startIndex, endIndex + 1);
  const lastKept = kept[kept.length - 1];
  const firstKept = kept[0];
  if (firstKept === undefined || lastKept === undefined) return pieces;
  if (startIndex === endIndex) {
    const [head] = split(firstKept, end);
    return [end === 0 ? head : split(head, start / end)[1]];
  }
  return [split(firstKept, start)[1], ...kept.slice(1, -1), split(lastKept, end)[0]];
}

/** A distance along the direction a side of a Resource faces. */
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

/** How far, and which way on the screen, a self-Edge's lane moves its source and target. */
function selfEdgeMoves(
  sourcePosition: Position,
  targetPosition: Position,
  offset: number,
): [number, number, number, number] {
  return [
    ...alongSideFromCorner(sourcePosition, targetPosition, offset),
    ...alongSideFromCorner(targetPosition, sourcePosition, offset),
  ];
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
