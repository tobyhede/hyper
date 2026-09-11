import { Position } from '@xyflow/react';

import { AUTHORING_HANDLE_DIAMETER } from './authoring-handle';

/** A Thing's rect on the canvas, in flow coordinates. */
export interface AnchorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The two sides an Edge attaches to: one on each Thing. */
export interface FacingSides {
  readonly source: Position;
  readonly target: Position;
}

const centre = (rect: AnchorRect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

/**
 * How far apart two rects are on one axis: positive when they are clear of each
 * other, negative by the depth of the overlap when they are not.
 */
const gap = (aMin: number, aMax: number, bMin: number, bMax: number): number =>
  Math.max(aMin - bMax, bMin - aMax);

/**
 * Which side of each Thing faces the other (ADR 0087).
 *
 * The axis is chosen by the **gap between the rects**, not by the vector between
 * their middles. Two Things are side by side when they are clear of each other
 * horizontally and overlapping vertically, whatever their sizes — and a large
 * Open Thing beside a collapsed one is the normal state of a Diagram someone is
 * reading, not an edge case. The centre vector answers that pair wrongly,
 * because a tall Thing's middle is far from a small neighbour sitting by its
 * lower edge.
 *
 * When the rects overlap on both axes neither gap is positive, and the larger —
 * the axis they overlap on least — still names the side an Edge crosses by the
 * shortest route. The direction is then the centre vector's, which is the only
 * thing that can answer it once the axis is fixed.
 */
export function facingSides(source: AnchorRect, target: AnchorRect): FacingSides {
  const horizontal = gap(source.x, source.x + source.width, target.x, target.x + target.width);
  const vertical = gap(source.y, source.y + source.height, target.y, target.y + target.height);
  const from = centre(source);
  const to = centre(target);

  if (horizontal >= vertical) {
    return to.x >= from.x
      ? { source: Position.Right, target: Position.Left }
      : { source: Position.Left, target: Position.Right };
  }
  return to.y >= from.y
    ? { source: Position.Bottom, target: Position.Top }
    : { source: Position.Top, target: Position.Bottom };
}

/** A point on the canvas, in flow coordinates. */
export interface AnchorPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Where an Edge meets the anchor on one side of a Thing.
 *
 * The same point React Flow resolves from the declaration `projection.ts` makes
 * for that side: the handle's own rect, offset from the Thing's, with the edge
 * of it facing outwards taken. Both read `AUTHORING_HANDLE_DIAMETER`, so a
 * drawn Edge lands on the anchor that was declared rather than near it.
 */
export function anchorPoint(rect: AnchorRect, side: Position): AnchorPoint {
  const radius = AUTHORING_HANDLE_DIAMETER / 2;
  switch (side) {
    case Position.Top:
      return { x: rect.x + rect.width / 2, y: rect.y - radius };
    case Position.Right:
      return { x: rect.x + rect.width + radius, y: rect.y + rect.height / 2 };
    case Position.Bottom:
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height + radius };
    case Position.Left:
      return { x: rect.x - radius, y: rect.y + rect.height / 2 };
  }
}

/**
 * Where an Edge begins and ends, in the shape `getBezierPath` reads.
 *
 * The same six fields React Flow hands a custom Edge as props. This module
 * answers them again because the props name the handles the *projection* chose,
 * and the side has to be chosen from where the two Things are at this moment
 * (ADR 0087).
 */
export interface EdgeAttachment {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourcePosition: Position;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetPosition: Position;
}

/** The anchors an Edge between two Things attaches to. */
export function edgeAttachment(source: AnchorRect, target: AnchorRect): EdgeAttachment {
  const sides = facingSides(source, target);
  const from = anchorPoint(source, sides.source);
  const to = anchorPoint(target, sides.target);
  return {
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: sides.source,
    targetX: to.x,
    targetY: to.y,
    targetPosition: sides.target,
  };
}

/**
 * The anchors a self-Edge attaches to: a fixed loop over two adjacent sides.
 *
 * Taken before the general rule rather than as a correction after it. The facing
 * rule divides by the vector between two centres, which is zero for one Thing,
 * and the sides it settles on face away from each other with the Thing between
 * them — so the curve would cross the Thing it belongs to.
 */
export function selfEdgeAttachment(rect: AnchorRect): EdgeAttachment {
  const from = anchorPoint(rect, Position.Right);
  const to = anchorPoint(rect, Position.Top);
  return {
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: Position.Right,
    targetX: to.x,
    targetY: to.y,
    targetPosition: Position.Top,
  };
}
