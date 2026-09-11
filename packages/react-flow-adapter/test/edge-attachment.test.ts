import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { AUTHORING_HANDLE_DIAMETER } from '../src/authoring-handle';
import {
  anchorPoint,
  edgeAttachment,
  facingSides,
  selfEdgeAttachment,
} from '../src/edge-attachment';

/**
 * Which side of a Thing an Edge leaves and enters, as a function of two rects
 * (ADR 0087).
 *
 * Pure and tested in the node environment: only reading the live positions is
 * React's, and it lives in the component.
 */
describe('facingSides', () => {
  it('leaves the right side and enters the left when the target is to the right', () => {
    const source = { x: 0, y: 0, width: 260, height: 146 };
    const target = { x: 600, y: 0, width: 260, height: 146 };

    expect(facingSides(source, target)).toEqual({
      source: Position.Right,
      target: Position.Left,
    });
  });

  it('leaves the left side and enters the right when the target is to the left', () => {
    const source = { x: 600, y: 0, width: 260, height: 146 };
    const target = { x: 0, y: 0, width: 260, height: 146 };

    expect(facingSides(source, target)).toEqual({
      source: Position.Left,
      target: Position.Right,
    });
  });

  it('leaves the bottom and enters the top when the target is below', () => {
    const source = { x: 0, y: 0, width: 260, height: 146 };
    const target = { x: 0, y: 500, width: 260, height: 146 };

    expect(facingSides(source, target)).toEqual({
      source: Position.Bottom,
      target: Position.Top,
    });
  });

  /*
   * The case the centre-to-centre vector gets wrong. These two rects overlap
   * vertically and are clear of each other horizontally — they are side by side,
   * and an author reading them sees the Edge cross the gap. But a tall Open
   * Thing's centre is far above a small Thing sitting by its lower edge, so the
   * vertical component of the centre vector is the larger one.
   *
   * Large beside small is the normal state of a Diagram someone is reading
   * (ADR 0087), so the rule reads the gap between the rects rather than the
   * distance between their middles.
   */
  it('faces the sides across the gap when a large Open Thing sits beside a collapsed one', () => {
    const open = { x: 0, y: 0, width: 560, height: 900 };
    const collapsed = { x: 620, y: 860, width: 260, height: 146 };

    expect(facingSides(open, collapsed)).toEqual({
      source: Position.Right,
      target: Position.Left,
    });
  });
});

describe('anchorPoint', () => {
  /*
   * The point React Flow itself resolves for the handle declared on that side:
   * `getHandlePosition` adds the handle's own rect to the node's absolute
   * position and takes the edge of it facing outwards, so an anchor sits on the
   * outer rim of its 24-unit handle rather than on the Thing's border.
   *
   * Asserted against the declared diameter rather than a literal, because the
   * declaration in `projection.ts` reads the same constant — `declared handles
   * and drawn ones cannot land in different places` is the rule this keeps.
   */
  it('sits on the outer rim of the handle declared on that side', () => {
    const rect = { x: 100, y: 200, width: 260, height: 146 };
    const radius = AUTHORING_HANDLE_DIAMETER / 2;

    expect(anchorPoint(rect, Position.Top)).toEqual({ x: 230, y: 200 - radius });
    expect(anchorPoint(rect, Position.Right)).toEqual({ x: 360 + radius, y: 273 });
    expect(anchorPoint(rect, Position.Bottom)).toEqual({ x: 230, y: 346 + radius });
    expect(anchorPoint(rect, Position.Left)).toEqual({ x: 100 - radius, y: 273 });
  });
});

describe('edgeAttachment', () => {
  it('answers the anchors on the two facing sides', () => {
    const source = { x: 0, y: 0, width: 260, height: 146 };
    const target = { x: 600, y: 0, width: 260, height: 146 };

    expect(edgeAttachment(source, target)).toEqual({
      sourcePosition: Position.Right,
      sourceX: anchorPoint(source, Position.Right).x,
      sourceY: anchorPoint(source, Position.Right).y,
      targetPosition: Position.Left,
      targetX: anchorPoint(target, Position.Left).x,
      targetY: anchorPoint(target, Position.Left).y,
    });
  });
});

describe('selfEdgeAttachment', () => {
  /*
   * A Graph may hold an Edge from a Thing to itself (ADR 0032), and the facing
   * rule has nothing to say about it: one rect faces itself on every side, and
   * the two anchors the general rule picks sit opposite each other with the
   * Thing in between, so the curve crosses its own Thing.
   *
   * A fixed loop over two adjacent sides is taken first instead, before the
   * geometry rather than as a correction after it.
   */
  it('loops between two adjacent sides of the one Thing', () => {
    const rect = { x: 100, y: 200, width: 260, height: 146 };

    expect(selfEdgeAttachment(rect)).toEqual({
      sourcePosition: Position.Right,
      sourceX: anchorPoint(rect, Position.Right).x,
      sourceY: anchorPoint(rect, Position.Right).y,
      targetPosition: Position.Top,
      targetX: anchorPoint(rect, Position.Top).x,
      targetY: anchorPoint(rect, Position.Top).y,
    });
  });
});
