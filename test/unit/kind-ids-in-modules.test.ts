import { describe, expect, it } from 'vitest';
import { lineAt, maskedCssSource, maskedTsSource, trackedFiles } from '../support/structural-scan';

/**
 * ADR 0128: every Resource kind is a module, and no rule outside it names the
 * kind. A kind moved onto its module (`.scratch/resource-kind-modules/`) is
 * named, as a quoted id in source or a CSS attribute selector, only under a
 * `kinds/` directory; everything else reaches it through the module's exports.
 * A kind joins this list in the change that moves it.
 */
const MOVED_KINDS = ['ur'] as const;

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
      return quotedAt(source, kind).map((index) => `${file}:${lineAt(source, index)}`);
    });

describe('a moved kind is named only by its module', () => {
  it.each(MOVED_KINDS)('names %s nowhere outside a kinds/ module', (kind) => {
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
