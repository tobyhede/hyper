import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CARD_HEIGHT, CARD_WIDTH } from '../src/card';
import { newCardDrop } from '../src/connection-gesture';

/**
 * That an authored Card is centred on the point it was dropped at.
 *
 * The rule this pins is not the subtraction — it is that the ghost the author
 * sees and the Card the release authors occupy the same place. Both sides used
 * to compute that top-left separately, from different sources, with nothing
 * asserting they agreed; a drift there does not fail, it quietly authors the
 * Card somewhere other than where the preview was drawn. Stated as *the centre
 * returns the drop point*, the property is independent of how the offset is
 * applied.
 *
 * Coordinates are bounded well inside the double range: the assertion is a
 * design statement about placement, not a claim that `(x - 130) + 130` is exact
 * at every magnitude.
 */

const coordinate = fc.double({
  min: -1e5,
  max: 1e5,
  noNaN: true,
  noDefaultInfinity: true,
});

describe('an authored empty-drop', () => {
  it('centres the Card on the drop point', () => {
    fc.assert(
      fc.property(coordinate, coordinate, fc.string({ minLength: 1 }), (x, y, sourceId) => {
        const drop = newCardDrop(
          { kind: 'dragging', sourceId, point: { x, y }, over: 'empty-canvas', modifierHeld: true },
          () => true,
        );
        expect(drop).not.toBeNull();
        expect(drop!.sourceId).toBe(sourceId);
        expect(drop!.position.x + CARD_WIDTH / 2).toBeCloseTo(x, 6);
        expect(drop!.position.y + CARD_HEIGHT / 2).toBeCloseTo(y, 6);
      }),
    );
  });
});
