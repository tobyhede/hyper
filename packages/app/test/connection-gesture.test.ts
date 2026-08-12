import { describe, expect, it } from 'vitest';
import { CARD_HEIGHT, CARD_WIDTH } from '../src/card';
import { newCardDrop, type ConnectionGesture, type DropTarget } from '../src/connection-gesture';

/**
 * The Alt/Option empty-drop rule, away from the browser.
 *
 * This file runs in the node environment — `vitest.config.ts` gives jsdom only
 * to `.tsx` — so the module under test cannot reach `document` even by mistake.
 * Whether the facts it is handed are read correctly from the DOM and from React
 * Flow is a browser question and stays in `new-space.spec.ts`,
 * `react-flow-integration.spec.ts` and `read-only.spec.ts`.
 */

const SOURCE = 'a-card';
const POINT = { x: 400, y: 260 };

const TARGETS: readonly DropTarget[] = ['connection-target', 'card', 'empty-canvas', 'off-canvas'];

const dragging = (over: DropTarget, modifierHeld = true): ConnectionGesture => ({
  kind: 'dragging',
  sourceId: SOURCE,
  point: POINT,
  over,
  modifierHeld,
});

const accepts = () => true;
const refuses = () => false;

describe('newCardDrop', () => {
  it('authors a Card centred on the drop point', () => {
    expect(newCardDrop(dragging('empty-canvas'), accepts)).toEqual({
      sourceId: SOURCE,
      position: { x: POINT.x - CARD_WIDTH / 2, y: POINT.y - CARD_HEIGHT / 2 },
    });
  });

  it('never asks the editor about a gesture it has already refused', () => {
    const asked: string[] = [];
    const record = (from: string) => {
      asked.push(from);
      return true;
    };
    newCardDrop(dragging('card'), record);
    newCardDrop(dragging('empty-canvas', false), record);
    expect(asked).toEqual([]);
  });

  describe('refuses', () => {
    it('a gesture that is not in progress', () => {
      expect(newCardDrop({ kind: 'idle' }, accepts)).toBeNull();
    });

    it.each(TARGETS.filter((over) => over !== 'empty-canvas'))('a drop over %s', (over) => {
      expect(newCardDrop(dragging(over), accepts)).toBeNull();
    });

    it('a drop with the modifier released', () => {
      expect(newCardDrop(dragging('empty-canvas', false), accepts)).toBeNull();
    });

    it('a drop the editor will not accept', () => {
      expect(newCardDrop(dragging('empty-canvas'), refuses)).toBeNull();
    });
  });

  /**
   * The whole matrix at once, so a later change cannot loosen one conjunct
   * without a failure. Sixteen combinations, exactly one of which authors —
   * asserted as a count rather than sixteen rows, which would restate the
   * implementation line by line.
   */
  it('authors on exactly one of the sixteen dragging combinations', () => {
    const authoring = TARGETS.flatMap((over) =>
      [true, false].flatMap((modifierHeld) =>
        [accepts, refuses]
          .map((accept) => newCardDrop(dragging(over, modifierHeld), accept))
          .filter((drop) => drop !== null),
      ),
    );
    expect(authoring).toHaveLength(1);
  });
});
