import { describe, expect, it } from 'vitest';
import { lineAt, maskedCssSource, maskedTsSource, trackedFiles } from '../support/structural-scan';

/**
 * ADR 0128: every Resource kind is a module, and no rule outside it names the
 * kind. A kind is named, as a quoted id in source or a CSS attribute selector,
 * only under a `kinds/` directory; everything else reaches it through the
 * module's exports.
 */
const KINDS = ['ur', 'image', 'markdown', 'reference', 'space'] as const;

/**
 * Quoted ids that are not the kind: `'space'` also tags a Space itself, as an
 * entity, a product destination, a Resources-list row, a drag, an icon and a
 * path label. Each file lists how many it holds, so a new one fails until it
 * is read and counted here.
 */
const NOT_THE_KIND = new Map<string, ReadonlyMap<string, number>>([
  [
    'space',
    new Map([
      ['packages/app/src/components/ResourcesPopover.tsx', 2],
      ['packages/app/src/destination-opening.ts', 1],
      ['packages/app/src/dock-chrome.ts', 1],
      ['packages/app/src/entity-actions.tsx', 6],
      ['packages/app/src/resource-placement.ts', 1],
      ['packages/app/src/resources-drag.ts', 2],
      ['packages/http/src/product-destination.ts', 3],
      ['packages/ui/src/icons.tsx', 1],
      ['src/aggregate-directory/identify-space.ts', 1],
      ['src/http/space-host.ts', 1],
    ]),
  ],
]);

/** Source the application, the hosts and the CLI are built from; tests and stories are not. */
const isScannedSource = (file: string): boolean =>
  /^(?:packages\/[^/]+\/src|src)\/.*\.(?:tsx?|css)$/u.test(file);

const isKindModule = (file: string): boolean => file.includes('/kinds/');

const sourceOf = (file: string): string =>
  file.endsWith('.css') ? maskedCssSource(file) : maskedTsSource(file);

/** Each index in `source` at which `kind` is written as a quoted string. */
const quotedAt = (source: string, kind: string): readonly number[] =>
  [...source.matchAll(new RegExp(`(['"\`])${kind}\\1`, 'gu'))].map((match) => match.index);

const namings = (kind: string): readonly string[] =>
  trackedFiles()
    .filter((file) => isScannedSource(file) && !isKindModule(file))
    .flatMap((file) => {
      const source = sourceOf(file);
      const lines = quotedAt(source, kind).map((index) => `${file}:${lineAt(source, index)}`);
      return lines.length === (NOT_THE_KIND.get(kind)?.get(file) ?? 0) ? [] : lines;
    });

describe('a kind is named only by its module', () => {
  it.each(KINDS)('names %s nowhere outside a kinds/ module', (kind) => {
    expect(namings(kind)).toEqual([]);
  });

  it('finds a kind id in any quote, and not a longer word', () => {
    const source = "a === 'ur'; b(\"ur\"); c = `ur`; d('urn', 'our')";
    expect(quotedAt(source, 'ur')).toHaveLength(3);
  });

  it('reads source in the kinds/ directories as module source', () => {
    expect(isKindModule('packages/core/src/kinds/ur.ts')).toBe(true);
    expect(isKindModule('packages/core/src/schema.ts')).toBe(false);
  });
});
