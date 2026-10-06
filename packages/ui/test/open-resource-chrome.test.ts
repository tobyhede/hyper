import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OPEN_RESOURCE_CHROME } from '@project/core';

/**
 * `OPEN_RESOURCE_CHROME` is what the domain adds to an Image Resource's natural
 * size on its first Open. It is only true while it equals what the Open front
 * draws around its content area, and jsdom computes no CSS, so what this
 * package's stylesheet declares is read off it here.
 *
 * Two parts of the drawn front are not this package's to state, and are held
 * where they are drawn: the edge's width is the host theme's
 * `--canvas-resource-border-width`, so this test takes it from the constant's
 * own width — two edges across — and holds the stylesheet's height to that; and
 * `packages/app/e2e/image-resource.spec.ts` measures the application's drawn
 * front, theme included, against the constant.
 *
 * The constant is the layout where a canvas adapter floats the commands outside
 * the Resource (`renderToolbar`), which is how the application draws it. Where
 * nothing floats them they are drawn in the rail and the content starts below
 * the command strip, so that layout takes more room than the constant and is
 * named here as the one exception.
 */

const sheet = readFileSync(
  fileURLToPath(new URL('../src/canvas-resource.css', import.meta.url)),
  'utf8',
).replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** Every rule in the sheet, `@media` bodies included, in source order. */
const rules = [...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((match) => ({
  selector: (match[1] ?? '').replaceAll(/\s+/gu, ' ').trim(),
  declarations: match[2] ?? '',
}));

/** Every declaration of the rules whose selector is exactly `selector`, in source order. */
const block = (selector: string): string => {
  const found = rules.filter((rule) => rule.selector === selector);
  expect(found.length, `no rule for ${selector}`).toBeGreaterThan(0);
  return found.map((rule) => rule.declarations).join(';');
};

/** The last value `property` is declared with, which is the one that wins. */
const declared = (declarations: string, property: string): string => {
  const found = [
    ...declarations.matchAll(new RegExp(String.raw`(?<![\w-])${property}:\s*([^;]+)`, 'gu')),
  ].at(-1);
  expect(found, `no ${property}`).toBeDefined();
  return found?.[1]?.replaceAll(/\s+/gu, ' ').trim() ?? '';
};

const px = (value: string): number => {
  expect(value).toMatch(/^\d+(\.\d+)?px$/u);
  return Number.parseFloat(value);
};

const RAIL_ACTIONS = ':has(> .canvas-resource__rail .canvas-resource__actions)';

describe('the Open front chrome, where the commands float outside the Resource', () => {
  const resource = block('.canvas-resource');
  const content = block('.canvas-resource__content');
  const edge = OPEN_RESOURCE_CHROME.width / 2;
  const paperAbove = px(declared(content, 'padding-top'));
  const divider = px(declared(resource, '--canvas-resource-content-divider-width'));
  const [paddingBlock] = declared(block('.canvas-resource__body'), 'padding').split(' ');
  const titleLine =
    px(declared(resource, '--canvas-resource-title-size')) *
    Number(declared(resource, '--canvas-resource-title-leading'));

  it('draws the edge, the content divider and a rail laid over the paper, as this test reads them', () => {
    expect(declared(resource, 'border')).toBe(
      'var(--canvas-resource-border-width) solid var(--canvas-resource-ink)',
    );
    // The rail is laid over the paper rather than above it, so it takes no room.
    expect(declared(block('.canvas-resource__rail'), 'position')).toBe('absolute');
    expect(declared(content, 'border-bottom')).toBe(
      'var(--canvas-resource-content-divider-width) solid var(--canvas-resource-ink)',
    );
  });

  it('pads the content and the Title footer of an Open Resource only as read here, bar the rail layout', () => {
    const padded = rules
      .filter(
        (rule) =>
          /\.canvas-resource__(content|body)\b/u.test(rule.selector) &&
          /(?<![\w-])padding(-top|-bottom|-block)?:/u.test(rule.declarations),
      )
      .map((rule) => rule.selector);
    expect(padded).toEqual([
      '.canvas-resource__body',
      '.canvas-resource__content',
      ".canvas-resource[data-open='false'] > .canvas-resource__body",
      // An Ur Resource keeps no glyph row, and has no content area for the
      // constant to measure, so its padding stands outside it too.
      ".canvas-resource[data-kind='ur'] > .canvas-resource__body",
      `.canvas-resource${RAIL_ACTIONS} .canvas-resource__content`,
      `.canvas-resource[data-open='false']${RAIL_ACTIONS} > .canvas-resource__body`,
      // Only an Ur Resource takes a Shape, and it has no content area for the
      // constant to measure, so its Shape's padding stands outside it.
      ".canvas-resource:not([data-resource-shape='rectangle']) > .canvas-resource__body",
    ]);
  });

  it('is the constant the first Open adds, down, with one Title line, rounded up to the whole unit', () => {
    const drawn = edge + paperAbove + divider + px(paddingBlock ?? '') * 2 + titleLine + edge;
    expect(OPEN_RESOURCE_CHROME.height).toBe(Math.ceil(drawn));
  });

  it('is exceeded where the commands are drawn in the rail, which is not the layout the constant states', () => {
    const inRail = declared(
      block(`.canvas-resource${RAIL_ACTIONS} .canvas-resource__content`),
      'padding-top',
    );
    expect(px(/^calc\((\d+px)/u.exec(inRail)?.[1] ?? '')).toBeGreaterThan(paperAbove);
  });
});
