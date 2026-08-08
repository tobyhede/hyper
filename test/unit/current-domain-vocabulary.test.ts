import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('current domain vocabulary', () => {
  it('uses Graph names for Graph palettes and fixtures', () => {
    const files = ['packages/app/src/colors.ts', 'packages/app/test/view.test.ts'];
    const obsoleteNames = files.flatMap((file) => {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      return [...source.matchAll(/\b(?:ROUTE_PALETTE|ROUTES)\b/g)].map(
        (match) => `${file}:${match[0]}`,
      );
    });

    expect(obsoleteNames).toEqual([]);
  });
});
