import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SPACE_CARD_FOOTER_HEIGHT,
  SPACE_CARD_EMBED_INSET,
  SPACE_CARD_MIN_OPEN_SIZE,
  COLLAPSED_CARD_SIZE,
} from '@project/core';

/**
 * The one number the stylesheet and the projection both read.
 *
 * An Open Space Card's Layout is React Flow sub-flow nodes painted *over*
 * the Card rather than DOM inside it (ADR 0068), so no CSS can lay out around
 * them and no measurement can discover where they go. The room they get is a
 * constant, and the two halves of it live in different packages: the projection
 * places a child inside `SPACE_CARD_EMBED_INSET`, and `canvas-card.css` holds the
 * Card's own passengers to a footer of exactly that height.
 *
 * Nothing in the type system connects a pixel in a stylesheet to a number in a
 * module, so this is what does. Drifting apart is silent and looks like a
 * rendering bug: the selectors grow under the drawn view, or the view floats
 * above a gap.
 */

const stylesheet = readFileSync(
  fileURLToPath(new URL('../src/canvas-card.css', import.meta.url)),
  'utf8',
);

describe('the room an Open Space Card reserves for its Layout', () => {
  it('gives the Card own footer exactly the height the inset clears', () => {
    const rule = /\.canvas-card\[data-kind='space'\]\[data-expanded='true'\][^{]*\{([^}]*)\}/.exec(
      stylesheet,
    );
    expect(rule).not.toBeNull();
    const height = /height:\s*(\d+)px/.exec(rule?.[1] ?? '');

    expect(Number(height?.[1])).toBe(SPACE_CARD_FOOTER_HEIGHT);
  });

  /**
   * The inset is measured from the node's own box and the Card carries a 4px
   * border, so `bottom` is the footer plus that border. Written as an equation
   * rather than as a second literal: a border change that moved one and not the
   * other would put the view a few pixels into the selectors.
   */
  it('clears the footer and the Card own border below the view', () => {
    const border = /\.canvas-card\s*\{[^}]*border:\s*(\d+)px solid/.exec(stylesheet);

    expect(SPACE_CARD_EMBED_INSET.bottom).toBe(SPACE_CARD_FOOTER_HEIGHT + Number(border?.[1]));
  });

  /**
   * The rail is the Card's own toolbar (ADR 0073) and sits above the view, so
   * `top` clears it and the border together. `card-rail.css` owns its height.
   */
  it('clears the rail and the border above the view', () => {
    const rail = readFileSync(
      fileURLToPath(new URL('../src/card-rail.css', import.meta.url)),
      'utf8',
    );
    const railHeight = /min-height:\s*(\d+)px/.exec(rail);
    const border = /\.canvas-card\s*\{[^}]*border:\s*(\d+)px solid/.exec(stylesheet);

    expect(SPACE_CARD_EMBED_INSET.top).toBeGreaterThanOrEqual(
      Number(railHeight?.[1]) + Number(border?.[1]),
    );
  });

  /**
   * The footer does not shrink, so the floor a resize may reach has to clear it.
   *
   * `.canvas-card` hides its own overflow, and an Open Space Card's passengers
   * are a fixed 176px body under a fixed-height rail inside the Card's border.
   * A floor shorter than their sum cuts the Graph selector off at a size the
   * resize control offers, which is why `SPACE_CARD_MIN_OPEN_SIZE` and not
   * `COLLAPSED_CARD_SIZE` is what an Open Space Card resizes against.
   */
  it('floors an Open Space Card above its own rail, footer and border', () => {
    const rail = readFileSync(
      fileURLToPath(new URL('../src/card-rail.css', import.meta.url)),
      'utf8',
    );
    const railHeight = /min-height:\s*(\d+)px/.exec(rail);
    const border = /\.canvas-card\s*\{[^}]*border:\s*(\d+)px solid/.exec(stylesheet);

    expect(SPACE_CARD_MIN_OPEN_SIZE.height).toBeGreaterThanOrEqual(
      Number(railHeight?.[1]) + SPACE_CARD_FOOTER_HEIGHT + 2 * Number(border?.[1]),
    );
  });

  /**
   * And the region left over is somewhere a Layout can be drawn rather than a
   * strip of nothing: the smallest Card the target Space can hold fits inside
   * the inset at the floor, on both axes.
   */
  it('leaves the floor room for one collapsed Card of the embedded Layout', () => {
    expect(
      SPACE_CARD_MIN_OPEN_SIZE.height - SPACE_CARD_EMBED_INSET.top - SPACE_CARD_EMBED_INSET.bottom,
    ).toBe(COLLAPSED_CARD_SIZE.height);
    expect(
      SPACE_CARD_MIN_OPEN_SIZE.width - SPACE_CARD_EMBED_INSET.left - SPACE_CARD_EMBED_INSET.right,
    ).toBe(COLLAPSED_CARD_SIZE.width);
  });
});
