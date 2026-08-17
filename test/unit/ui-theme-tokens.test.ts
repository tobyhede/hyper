import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const theme = readFileSync(new URL('../../packages/app/src/tailwind.css', import.meta.url), 'utf8');

const themeTokens = new Set([...theme.matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1]!));

// Base UI writes these onto a portalled surface at position time (available
// height, anchor width, transform origin for the open/close animation) — they
// are never part of the semantic token contract `tailwind.css` owns.
const RUNTIME_POSITIONING_TOKENS = new Set([
  '--available-height',
  '--anchor-width',
  '--transform-origin',
]);

const SCAN_ROOTS = [
  new URL('../../packages/ui/src/', import.meta.url),
  new URL('../../packages/react-flow-adapter/src/', import.meta.url),
];

const sourceFiles = (directory: URL): readonly URL[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) return sourceFiles(child);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [child] : [];
  });

const files = SCAN_ROOTS.flatMap(sourceFiles);

describe('CSS custom properties referenced by ui and react-flow-adapter', () => {
  it('only reference tokens the theme defines', () => {
    const undefinedUsages = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const names = [...text.matchAll(/var\((--[\w-]+)\)/g)].map((match) => match[1]!);
      return names
        .filter((name) => !themeTokens.has(name) && !RUNTIME_POSITIONING_TOKENS.has(name))
        .map((name) => `${file.pathname}: ${name}`);
    });

    expect(undefinedUsages).toEqual([]);
  });

  it('never colors text with the muted background token', () => {
    // `--muted` resolves to `--secondary` (a background); text wanting the old
    // muted grey must use `--muted-foreground`, the token this theme pairs it with.
    const misusedAsText = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      const matches = [...text.matchAll(/text-\[var\(--muted\)\]/g)];
      return matches.map(() => file.pathname);
    });

    expect(misusedAsText).toEqual([]);
  });
});
