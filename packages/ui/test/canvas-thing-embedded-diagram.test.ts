import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SPACE_THING_FOOTER_HEIGHT,
  SPACE_THING_EMBED_INSET,
  SPACE_THING_MIN_OPEN_SIZE,
  COLLAPSED_THING_SIZE,
} from '@project/core';

/**
 * The one number the stylesheet and the projection both read.
 *
 * An Open Space Thing's Diagram is React Flow sub-flow nodes painted *over*
 * the Thing rather than DOM inside it (ADR 0068), so no CSS can lay out around
 * them and no measurement can discover where they go. The room they get is a
 * constant, and the two halves of it live in different packages: the projection
 * places a child inside `SPACE_THING_EMBED_INSET`, and `canvas-thing.css` holds the
 * Thing's own passengers to a footer of exactly that height.
 *
 * Nothing in the type system connects a pixel in a stylesheet to a number in a
 * module, so this is what does. Drifting apart is silent and looks like a
 * rendering bug: the selectors grow under the drawn view, or the view floats
 * above a gap.
 */

const stylesheet = readFileSync(
  fileURLToPath(new URL('../src/canvas-thing.css', import.meta.url)),
  'utf8',
);

describe('the room an Open Space Thing reserves for its Diagram', () => {
  it('gives the Thing own footer exactly the height the inset clears', () => {
    const rule = /\.canvas-thing\[data-kind='space'\]\[data-expanded='true'\][^{]*\{([^}]*)\}/.exec(
      stylesheet,
    );
    expect(rule).not.toBeNull();
    const height = /height:\s*(\d+)px/.exec(rule?.[1] ?? '');

    expect(Number(height?.[1])).toBe(SPACE_THING_FOOTER_HEIGHT);
  });

  /**
   * The inset is measured from the node's own box and the Thing carries a 4px
   * border, so `bottom` is the footer plus that border. Written as an equation
   * rather than as a second literal: a border change that moved one and not the
   * other would put the view a few pixels into the selectors.
   */
  it('clears the footer and the Thing own border below the view', () => {
    const border = /\.canvas-thing\s*\{[^}]*border:\s*(\d+)px solid/.exec(stylesheet);

    expect(SPACE_THING_EMBED_INSET.bottom).toBe(SPACE_THING_FOOTER_HEIGHT + Number(border?.[1]));
  });

  /**
   * The rail is the Thing's own toolbar (ADR 0073) and sits above the view, so
   * `top` clears it and the border together. `thing-rail.css` owns its height.
   */
  it('clears the rail and the border above the view', () => {
    const rail = readFileSync(
      fileURLToPath(new URL('../src/thing-rail.css', import.meta.url)),
      'utf8',
    );
    const railHeight = /min-height:\s*(\d+)px/.exec(rail);
    const border = /\.canvas-thing\s*\{[^}]*border:\s*(\d+)px solid/.exec(stylesheet);

    expect(SPACE_THING_EMBED_INSET.top).toBeGreaterThanOrEqual(
      Number(railHeight?.[1]) + Number(border?.[1]),
    );
  });

  /**
   * The footer does not shrink, so the floor a resize may reach has to clear it.
   *
   * `.canvas-thing` hides its own overflow, and an Open Space Thing's passengers
   * are a fixed 176px body under a fixed-height rail inside the Thing's border.
   * A floor shorter than their sum cuts the Graph selector off at a size the
   * resize control offers, which is why `SPACE_THING_MIN_OPEN_SIZE` and not
   * `COLLAPSED_THING_SIZE` is what an Open Space Thing resizes against.
   */
  it('floors an Open Space Thing above its own rail, footer and border', () => {
    const rail = readFileSync(
      fileURLToPath(new URL('../src/thing-rail.css', import.meta.url)),
      'utf8',
    );
    const railHeight = /min-height:\s*(\d+)px/.exec(rail);
    const border = /\.canvas-thing\s*\{[^}]*border:\s*(\d+)px solid/.exec(stylesheet);

    expect(SPACE_THING_MIN_OPEN_SIZE.height).toBeGreaterThanOrEqual(
      Number(railHeight?.[1]) + SPACE_THING_FOOTER_HEIGHT + 2 * Number(border?.[1]),
    );
  });

  /**
   * And the region left over is somewhere a Diagram can be drawn rather than a
   * strip of nothing: the smallest Thing the target Space can hold fits inside
   * the inset at the floor, on both axes.
   */
  it('leaves the floor room for one collapsed Thing of the embedded Diagram', () => {
    expect(
      SPACE_THING_MIN_OPEN_SIZE.height -
        SPACE_THING_EMBED_INSET.top -
        SPACE_THING_EMBED_INSET.bottom,
    ).toBe(COLLAPSED_THING_SIZE.height);
    expect(
      SPACE_THING_MIN_OPEN_SIZE.width -
        SPACE_THING_EMBED_INSET.left -
        SPACE_THING_EMBED_INSET.right,
    ).toBe(COLLAPSED_THING_SIZE.width);
  });
});
