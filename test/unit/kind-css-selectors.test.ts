import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIND_IDS } from '@project/core';
import { trackedFiles } from '../support/structural-scan';

/**
 * A kind's stylesheet selects its Resources by attribute, `[data-kind='…']` or
 * `[data-content-kind='…']`, and no compiler reads CSS. So a kind id a selector
 * names must be a registered one, or renaming a kind silently drops its styles.
 */
const KIND_SELECTOR = /\[data-(?:content-)?kind=(['"])([^'"]*)\1\]/gu;

const selectedKinds = (): readonly { readonly file: string; readonly kind: string }[] =>
  trackedFiles()
    .filter((file) => /^packages\/[^/]+\/src\/.*\.css$/u.test(file))
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(KIND_SELECTOR)].map((match) => ({
        file,
        kind: match[2] ?? '',
      })),
    );

describe('a stylesheet that selects a kind', () => {
  it('names a registered kind', () => {
    const registered = new Set<string>(KIND_IDS);
    expect(selectedKinds().filter(({ kind }) => !registered.has(kind))).toEqual([]);
  });

  it('is found by the scan', () => {
    expect(selectedKinds().length).toBeGreaterThan(0);
  });
});
