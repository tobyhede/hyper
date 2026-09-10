import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLLAPSED_CARD_SIZE } from '@project/core';

/**
 * The Title ladder's typography, read off the stylesheet that declares it.
 *
 * Two things are being held here and neither is visible to a renderer test.
 *
 * The first is a **regression**: a Title with no break in it is the Title Hyper
 * has always drawn, and ADR 0083 says so in as many words. Its four numbers —
 * 18px, weight 600, leading 1.12, tracking -0.02em — are asserted as numbers
 * rather than left to a reviewer's eye, because a ladder built on top of them
 * is exactly the change that could move them without anything failing.
 *
 * The second is that the two rungs below the name are **derived** rather than
 * authored: a ratio of the `title` role's own size, so the scale moves as one.
 * Three independent `font-size` declarations would draw the same picture today
 * and drift the day the name's size changes.
 *
 * jsdom computes no CSS, so a rendering test cannot see any of it; the browser
 * suites see the drawn result but not which declaration produced it. Reading
 * the source is what is left, and `canvas-card-embedded-layout.test.ts` already
 * does it for the one other number this stylesheet shares with the domain.
 */

const stylesheet = readFileSync(
  fileURLToPath(new URL('../src/canvas-card.css', import.meta.url)),
  'utf8',
);

const railStylesheet = readFileSync(
  fileURLToPath(new URL('../src/card-rail.css', import.meta.url)),
  'utf8',
);

/** The declaration block of the rule whose selector is exactly `selector`. */
const block = (selector: string): string => {
  const escaped = selector.replaceAll(/[.[\]^$*+?()|{}\\]/gu, String.raw`\$&`);
  // Anchored to the start of a line, so `.canvas-card` finds the Card's own
  // rule rather than the first rule that happens to mention it.
  const found = new RegExp(String.raw`^${escaped}\s*\{([^}]*)\}`, 'mu').exec(stylesheet);
  expect(found, `no rule for ${selector}`).not.toBeNull();
  return found?.[1] ?? '';
};

/** The value of `property` in `declarations`, with its whitespace collapsed. */
const declared = (declarations: string, property: string): string | undefined => {
  // A lookbehind rather than a start anchor: a declaration may follow a
  // comment, and `color` must not be found inside `background-color`.
  const found = new RegExp(String.raw`(?<![\w-])${property}:\s*([^;]+)`, 'u').exec(declarations);
  return found?.[1]?.replaceAll(/\s+/gu, ' ').trim();
};

/** A custom property declared on the Card, as a number of `unit`. */
const token = (name: string, unit = ''): number => {
  const value = declared(block('.canvas-card'), name);
  expect(value, `no ${name} on .canvas-card`).toBeDefined();
  expect(value?.endsWith(unit)).toBe(true);
  return Number.parseFloat(value ?? '');
};

const rung = (role: string): string => block(`.canvas-card__title-line[data-role='${role}']`);

describe('a single-line Title', () => {
  /**
   * The regression. These are the four values the heading carried before the
   * ladder existed, and a Title of one line is only ever the `title` role, so
   * they are still the whole of what draws it.
   */
  it('is still drawn at 18px, weight 600, leading 1.12 and tracking -0.02em', () => {
    expect(token('--canvas-card-title-size', 'px')).toBe(18);
    expect(token('--canvas-card-title-leading')).toBe(1.12);

    const heading = block('.canvas-card__title');
    expect(declared(heading, 'font-size')).toBe('var(--canvas-card-title-size)');
    expect(declared(heading, 'font-weight')).toBe('600');
    expect(declared(heading, 'line-height')).toBe('var(--canvas-card-title-leading)');
    expect(declared(heading, 'letter-spacing')).toBe('-0.02em');

    expect(declared(rung('title'), 'font-size')).toBe('var(--canvas-card-title-size)');
    expect(declared(rung('title'), 'font-weight')).toBe('600');
  });

  /** Bottom-anchored: the body puts its passengers at the foot of the Card. */
  it('is still bottom-anchored in the Card body', () => {
    expect(declared(block('.canvas-card__body'), 'justify-content')).toBe('flex-end');
  });

  /**
   * And it wraps at the `title` role for as many visual lines as it needs, to
   * the same three-line clamp the heading used to carry. The break the box
   * chooses is not a rung.
   */
  it('still clamps to three visual lines at the title role', () => {
    expect(declared(rung('title'), '-webkit-line-clamp')).toBe('3');
    expect(declared(block('.canvas-card__title-line'), 'white-space')).toBe('normal');
  });
});

describe('the rungs below the name', () => {
  it('derive their size from the title role by ratio rather than restating one', () => {
    expect(declared(rung('subtitle'), 'font-size')).toBe(
      'calc(var(--canvas-card-title-size) * var(--canvas-card-subtitle-ratio))',
    );
    expect(declared(rung('caption'), 'font-size')).toBe(
      'calc(var(--canvas-card-title-size) * var(--canvas-card-caption-ratio))',
    );

    // Descending, and by enough to be read as a step rather than a wobble.
    const subtitle = token('--canvas-card-subtitle-ratio');
    const caption = token('--canvas-card-caption-ratio');
    expect(subtitle).toBeLessThan(1);
    expect(caption).toBeLessThan(subtitle);
  });

  it('step the weight 600 / 500 / 400', () => {
    expect(declared(rung('title'), 'font-weight')).toBe('600');
    expect(declared(rung('subtitle'), 'font-weight')).toBe('500');
    expect(declared(rung('caption'), 'font-weight')).toBe('400');
  });

  /**
   * The size and the weight step are already saying "descending". A third
   * mechanism saying it again would be dimming, on a front where the Graph
   * colour is carrying information of its own — so no rung sets an ink or an
   * opacity, and all three take `--canvas-card-title` from the heading.
   */
  it('keep the heading own colour and are not dimmed', () => {
    expect(declared(block('.canvas-card__title'), 'color')).toBe('var(--canvas-card-title)');
    for (const role of ['title', 'subtitle', 'caption']) {
      expect(declared(rung(role), 'color')).toBeUndefined();
      expect(declared(rung(role), 'opacity')).toBeUndefined();
    }
  });

  /** Clamping counts visual lines, and it counts them per role. */
  it('clamp visual lines per role', () => {
    const clamps = ['title', 'subtitle', 'caption'].map((role) =>
      Number(declared(rung(role), '-webkit-line-clamp')),
    );
    expect(clamps.every((count) => Number.isInteger(count) && count > 0)).toBe(true);

    const base = block('.canvas-card__title-line');
    expect(declared(base, 'display')).toBe('-webkit-box');
    expect(declared(base, '-webkit-box-orient')).toBe('vertical');
    expect(declared(base, 'overflow')).toBe('hidden');
  });
});

describe('the ladder ceiling', () => {
  /**
   * Placement is authored, so the Title is clamped to the room available and
   * the Card is never resized to fit one (ADR 0014, ADR 0066, ADR 0083).
   *
   * The ceiling is a count of `title`-role lines rather than the room the Card
   * happens to have, so that the ladder draws the same Open and Closed. What
   * makes that count safe is this: it fits inside the body of a **Closed** Card,
   * which is the smaller of the two and the authored default. Nothing in the
   * type system connects the pixels in this stylesheet to `COLLAPSED_CARD_SIZE`,
   * so this is what does — a border, a rail or a padding change that stole the
   * room would otherwise show up as a Title quietly overrunning its Card.
   */
  it('fits inside the body of a Closed Card', () => {
    const card = block('.canvas-card');
    const border = Number.parseFloat(declared(card, 'border')?.split('px')[0] ?? '');
    const railHeight = Number.parseFloat(/min-height:\s*(\d+)px/u.exec(railStylesheet)?.[1] ?? '');
    const bodyPadding = Number.parseFloat(
      declared(block('.canvas-card__body'), 'padding')?.split('px')[0] ?? '',
    );

    const room = COLLAPSED_CARD_SIZE.height - 2 * border - railHeight - 2 * bodyPadding;
    const ceiling =
      token('--canvas-card-title-size', 'px') *
      token('--canvas-card-title-leading') *
      token('--canvas-card-title-ladder-lines');

    expect(ceiling).toBeGreaterThan(0);
    expect(ceiling).toBeLessThanOrEqual(room);
  });

  /** And the heading clips at that ceiling rather than growing past it. */
  it('is a clip on the heading, not a size the Card grows to', () => {
    const heading = block('.canvas-card__title');
    const ceiling = declared(heading, 'max-height') ?? '';
    expect(ceiling.startsWith('calc(')).toBe(true);
    for (const name of [
      '--canvas-card-title-size',
      '--canvas-card-title-leading',
      '--canvas-card-title-ladder-lines',
    ]) {
      expect(ceiling).toContain(name);
    }
    expect(declared(heading, 'overflow')).toBe('hidden');
    expect(declared(heading, 'height')).toBeUndefined();
    expect(declared(heading, 'min-height')).toBeUndefined();
  });
});
