import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OPEN_RESOURCE_CHROME } from '@project/core';

/**
 * `OPEN_RESOURCE_CHROME` is what the domain adds to an Image Resource's natural
 * size on its first Open (ADR 0107). It is only true while it equals what the
 * Open Markdown front draws around its content area, and jsdom computes no CSS,
 * so the numbers are read off the stylesheets that declare them. The Ladle
 * suite (`resource-open.spec.ts`) measures the drawn result in a browser.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const resourceSheet = read('../src/canvas-resource.css');
const themeSheet = read('../../app/src/tailwind.css');

/**
 * Every declaration of the top-level rules whose selector opens a line and is
 * exactly `selector`, in source order — which is the cascade order for them.
 */
const block = (sheet: string, selector: string): string => {
  const escaped = selector.replaceAll(/[.[\]^$*+?()|{}\\]/gu, String.raw`\$&`);
  const found = [...sheet.matchAll(new RegExp(String.raw`^${escaped}\s*\{([^}]*)\}`, 'gmu'))];
  expect(found.length, `no rule for ${selector}`).toBeGreaterThan(0);
  return found.map((match) => match[1] ?? '').join(';');
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

describe('the Open Markdown front chrome', () => {
  const resource = block(resourceSheet, '.canvas-resource');
  const border = px(declared(themeSheet, '--canvas-resource-border-width'));
  const content = block(resourceSheet, '.canvas-resource__content');
  // The rail is laid over the paper rather than above it, so it takes no room.
  const railPosition = declared(block(resourceSheet, '.canvas-resource__rail'), 'position');
  const paperAbove = px(declared(content, 'padding-top'));
  const divider = px(declared(resource, '--canvas-resource-content-divider-width'));
  const [paddingBlock] = declared(block(resourceSheet, '.canvas-resource__body'), 'padding').split(
    ' ',
  );
  const titleLine =
    px(declared(resource, '--canvas-resource-title-size')) *
    Number(declared(resource, '--canvas-resource-title-leading'));

  it('draws the edge, the content divider and a rail laid over the paper, as this test reads them', () => {
    expect(declared(resource, 'border')).toBe(
      'var(--canvas-resource-border-width) solid var(--canvas-resource-ink)',
    );
    expect(railPosition).toBe('absolute');
    expect(declared(content, 'border-bottom')).toBe(
      'var(--canvas-resource-content-divider-width) solid var(--canvas-resource-ink)',
    );
  });

  it('is the constant the first Open adds, across', () => {
    expect(OPEN_RESOURCE_CHROME.width).toBe(border * 2);
  });

  it('is the constant the first Open adds, down, with one Title line, to the whole unit', () => {
    const drawn = border + paperAbove + divider + px(paddingBlock ?? '') * 2 + titleLine + border;
    expect(OPEN_RESOURCE_CHROME.height).toBe(Math.ceil(drawn));
  });
});
