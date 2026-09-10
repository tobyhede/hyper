import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COLLAPSED_THING_SIZE } from '@project/core';

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
 * the source is what is left, and `canvas-thing-embedded-diagram.test.ts` already
 * does it for the one other number this stylesheet shares with the domain.
 */

const stylesheet = readFileSync(
  fileURLToPath(new URL('../src/canvas-thing.css', import.meta.url)),
  'utf8',
);

const railStylesheet = readFileSync(
  fileURLToPath(new URL('../src/thing-rail.css', import.meta.url)),
  'utf8',
);

/** The declaration block of the rule whose selector is exactly `selector`. */
const block = (selector: string): string => {
  const escaped = selector.replaceAll(/[.[\]^$*+?()|{}\\]/gu, String.raw`\$&`);
  // Anchored to the start of a line, so `.canvas-thing` finds the Thing's own
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

/** A custom property declared on the Thing, as a number of `unit`. */
const token = (name: string, unit = ''): number => {
  const value = declared(block('.canvas-thing'), name);
  expect(value, `no ${name} on .canvas-thing`).toBeDefined();
  expect(value?.endsWith(unit)).toBe(true);
  return Number.parseFloat(value ?? '');
};

const rung = (role: string): string => block(`.canvas-thing__title-line[data-role='${role}']`);

/**
 * Every declaration the editing field takes, in cascade order.
 *
 * The field is written by two rules — one it shares with its wrapper and one of
 * its own — and {@link block} answers the first rule whose selector opens a
 * line, which is the shared one. Joining them is what the browser does anyway,
 * and the property this file asks after is declared exactly once across the two.
 */
const titleInput = (): string =>
  [...stylesheet.matchAll(/^\.canvas-thing \.thing__title-input\s*\{([^}]*)\}/gmu)]
    .map((found) => found[1] ?? '')
    .join(';');

describe('a single-line Title', () => {
  /**
   * The regression. These are the four values the heading carried before the
   * ladder existed, and a Title of one line is only ever the `title` role, so
   * they are still the whole of what draws it.
   */
  it('is still drawn at 18px, weight 600, leading 1.12 and tracking -0.02em', () => {
    expect(token('--canvas-thing-title-size', 'px')).toBe(18);
    expect(token('--canvas-thing-title-leading')).toBe(1.12);

    const heading = block('.canvas-thing__title');
    expect(declared(heading, 'font-size')).toBe('var(--canvas-thing-title-size)');
    expect(declared(heading, 'font-weight')).toBe('600');
    expect(declared(heading, 'line-height')).toBe('var(--canvas-thing-title-leading)');
    expect(declared(heading, 'letter-spacing')).toBe('-0.02em');

    expect(declared(rung('title'), 'font-size')).toBe('var(--canvas-thing-title-size)');
    expect(declared(rung('title'), 'font-weight')).toBe('600');
  });

  /** Bottom-anchored: the body puts its passengers at the foot of the Thing. */
  it('is still bottom-anchored in the Thing body', () => {
    expect(declared(block('.canvas-thing__body'), 'justify-content')).toBe('flex-end');
  });

  /**
   * And it wraps at the `title` role for as many visual lines as it needs, to
   * the same three-line clamp the heading used to carry. The break the box
   * chooses is not a rung.
   */
  it('still clamps to three visual lines at the title role', () => {
    expect(declared(rung('title'), '-webkit-line-clamp')).toBe('3');
    expect(declared(block('.canvas-thing__title-line'), 'white-space')).toBe('normal');
  });
});

describe('the rungs below the name', () => {
  it('derive their size from the title role by ratio rather than restating one', () => {
    expect(declared(rung('subtitle'), 'font-size')).toBe(
      'calc(var(--canvas-thing-title-size) * var(--canvas-thing-subtitle-ratio))',
    );
    expect(declared(rung('caption'), 'font-size')).toBe(
      'calc(var(--canvas-thing-title-size) * var(--canvas-thing-caption-ratio))',
    );

    // Descending, and by enough to be read as a step rather than a wobble.
    const subtitle = token('--canvas-thing-subtitle-ratio');
    const caption = token('--canvas-thing-caption-ratio');
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
   * opacity, and all three take `--canvas-thing-title` from the heading.
   */
  it('keep the heading own colour and are not dimmed', () => {
    expect(declared(block('.canvas-thing__title'), 'color')).toBe('var(--canvas-thing-title)');
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

    const base = block('.canvas-thing__title-line');
    expect(declared(base, 'display')).toBe('-webkit-box');
    expect(declared(base, '-webkit-box-orient')).toBe('vertical');
    expect(declared(base, 'overflow')).toBe('hidden');
  });
});

describe('the ladder ceiling', () => {
  /**
   * Placement is authored, so the Title is clamped to the room available and
   * the Thing is never resized to fit one (ADR 0014, ADR 0066, ADR 0083).
   *
   * The ceiling is a count of `title`-role lines rather than the room the Thing
   * happens to have, so that the ladder draws the same Open and Closed. What
   * makes that count safe is this: it fits inside the body of a **Closed** Thing,
   * which is the smaller of the two and the authored default. Nothing in the
   * type system connects the pixels in this stylesheet to `COLLAPSED_THING_SIZE`,
   * so this is what does — a border, a rail or a padding change that stole the
   * room would otherwise show up as a Title quietly overrunning its Thing.
   */
  it('fits inside the body of a Closed Thing', () => {
    const thing = block('.canvas-thing');
    const border = Number.parseFloat(declared(thing, 'border')?.split('px')[0] ?? '');
    const railHeight = Number.parseFloat(/min-height:\s*(\d+)px/u.exec(railStylesheet)?.[1] ?? '');
    const bodyPadding = Number.parseFloat(
      declared(block('.canvas-thing__body'), 'padding')?.split('px')[0] ?? '',
    );

    const room = COLLAPSED_THING_SIZE.height - 2 * border - railHeight - 2 * bodyPadding;
    const ceiling =
      token('--canvas-thing-title-size', 'px') *
      token('--canvas-thing-title-leading') *
      token('--canvas-thing-title-ladder-lines');

    expect(ceiling).toBeGreaterThan(0);
    expect(ceiling).toBeLessThanOrEqual(room);
  });

  /** And the heading clips at that ceiling rather than growing past it. */
  it('is a clip on the heading, not a size the Thing grows to', () => {
    const heading = block('.canvas-thing__title');
    const ceiling = declared(heading, 'max-height') ?? '';
    expect(ceiling.startsWith('calc(')).toBe(true);
    for (const name of [
      '--canvas-thing-title-size',
      '--canvas-thing-title-leading',
      '--canvas-thing-title-ladder-lines',
    ]) {
      expect(ceiling).toContain(name);
    }
    expect(declared(heading, 'overflow')).toBe('hidden');
    expect(declared(heading, 'height')).toBeUndefined();
    expect(declared(heading, 'min-height')).toBeUndefined();
  });
});

describe('the field that writes the Title', () => {
  /**
   * The one size and the one leading are authored on the Thing, and the field an
   * author types into is drawn by the same two. Restating them here is what lets
   * the ladder and the field disagree: move `--canvas-thing-title-size` and the
   * heading, all three rungs and the clamp follow it while the field stays where
   * it was, so the Title changes size and baseline the moment it is clicked into
   * — which is the one moment the two are meant to be indistinguishable.
   */
  it('takes its type from the ladder tokens rather than restating them', () => {
    const input = titleInput();
    expect(declared(input, 'font-size')).toBe('var(--canvas-thing-title-size)');
    expect(declared(input, 'line-height')).toBe('var(--canvas-thing-title-leading)');
    expect(declared(input, 'font-weight')).toBe('600');
    expect(declared(input, 'letter-spacing')).toBe('-0.02em');
  });

  /**
   * And it stops growing where the drawn ladder stops.
   *
   * A Title is clamped to the room available and never accommodated (ADR 0083),
   * and the field is not exempt from that: it grows with its content, inside a
   * Thing whose height is authored. Uncapped, the fifth line pushes the Thing's
   * own rail up out of the top of a Closed Thing, where `overflow: hidden` takes
   * it — the kind glyph, the Actions menu and Open all gone while the author is
   * still typing. Capping it at the ladder's own ceiling makes what an author
   * can see while writing exactly what the Thing will draw.
   */
  it('is capped at the ceiling the drawn ladder is capped at', () => {
    const input = titleInput();
    const cap = declared(input, 'max-height') ?? '';
    expect(cap.startsWith('calc(')).toBe(true);
    for (const name of [
      '--canvas-thing-title-size',
      '--canvas-thing-title-leading',
      '--canvas-thing-title-ladder-lines',
    ]) {
      expect(cap).toContain(name);
    }
    // Scrolled rather than clipped: the field is the one place the whole Title
    // has to stay reachable, however many lines the author has typed.
    expect(declared(input, 'overflow-y')).toBe('auto');
  });
});
