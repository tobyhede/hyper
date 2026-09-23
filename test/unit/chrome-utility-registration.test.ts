import { cn } from '@project/ui';
import { describe, expect, it } from 'vitest';
import {
  bracketBody,
  LIVE_THEME,
  maskedCssSource,
  maskedTsSource,
  themeBlocks,
} from '../support/structural-scan';

/**
 * Arm 4 of ticket 08's structural scan (`test/support/structural-scan.ts`
 * reads the source and states what every arm shares): ticket 02's
 * `tailwind-merge` finding. Every class-generating `*-chrome-*` utility the
 * theme emits, from any `@theme` block or `@utility`, is registered beside
 * `cn()`, and every registration names a utility the theme actually emits —
 * the two lists ticket 08 was written to hold together.
 */

/**
 * What each Tailwind v4 `@theme` namespace does with a `*-chrome-*` key, as far
 * as `cn()` is concerned. A namespace mapped to a utility prefix generates a
 * class `tailwind-merge` does not group by name, so it fails the merge
 * unregistered: `tailwind-merge` reads an unknown `shadow-*` word as a shadow
 * colour, so a hypothetical `shadow-chrome-probe` does not evict `shadow-lg`
 * (the "keeps a built-in step beside an unregistered chrome word" fixture
 * below holds that). `color` is merged without registration, because
 * `tailwind-merge` groups every colour utility by an accept-anything validator
 * (the "merges a colour utility without registration" fixture). `border-width`
 * is absent because ticket 01 records Tailwind v4 ships no themable
 * border-width namespace, which is why `border-chrome-accent` is a `@utility`
 * rather than a theme key. An absent namespace is reported, not skipped.
 */
type ThemeNamespace =
  | { readonly kind: 'utility'; readonly prefix: string }
  | { readonly kind: 'merged-without-registration' };

const THEME_NAMESPACES: ReadonlyMap<string, ThemeNamespace> = new Map<string, ThemeNamespace>([
  ['radius', { kind: 'utility', prefix: 'rounded' }],
  ['text', { kind: 'utility', prefix: 'text' }],
  ['font-weight', { kind: 'utility', prefix: 'font' }],
  ['shadow', { kind: 'utility', prefix: 'shadow' }],
  ['drop-shadow', { kind: 'utility', prefix: 'drop-shadow' }],
  ['inset-shadow', { kind: 'utility', prefix: 'inset-shadow' }],
  ['color', { kind: 'merged-without-registration' }],
]);
const CHROME_THEME_KEY = /--([a-z][a-z-]*?)-chrome(-[\w-]+)?\s*:/gu;

const themeChromeKeys = (
  css: string,
): readonly { readonly key: string; readonly namespace: string; readonly step: string }[] =>
  themeBlocks(css).flatMap((block) =>
    [...block.matchAll(CHROME_THEME_KEY)].flatMap((match) => {
      const namespace = match[1];
      if (namespace === undefined) return [];
      const step = match[2] ?? '';
      return [{ key: `--${namespace}-chrome${step}`, namespace, step }];
    }),
  );

/** The utility classes Tailwind generates from every `@theme` block's own `*-chrome-*` keys. */
const themeBlockChromeUtilities = (css: string): readonly string[] =>
  themeChromeKeys(css).flatMap(({ namespace, step }) => {
    const handling = THEME_NAMESPACES.get(namespace);
    return handling?.kind === 'utility' ? [`${handling.prefix}-chrome${step}`] : [];
  });

/**
 * A `@theme` chrome key in a namespace `THEME_NAMESPACES` does not name: it generates classes this arm cannot compare, so it
 * is reported rather than skipped.
 */
const unmappedThemeChromeKeys = (css: string): readonly string[] =>
  themeChromeKeys(css)
    .filter(({ namespace }) => !THEME_NAMESPACES.has(namespace))
    .map(({ key }) => key);

const UTILITY_DIRECTIVE = /@utility\s+([\w-]+)\s*\{/gu;

/** A hand-declared `@utility name { … }` block whose name carries "chrome" — `border-chrome-accent`'s own route to a class. */
const utilityDirectiveChromeUtilities = (css: string): readonly string[] =>
  [...css.matchAll(UTILITY_DIRECTIVE)]
    .map((match) => match[1])
    .filter((name): name is string => name?.includes('chrome') ?? false);

/** Every class-generating `*-chrome-*` utility the theme file states, by either route. */
const themeClassGeneratingChromeUtilities = (css: string): readonly string[] => [
  ...themeBlockChromeUtilities(css),
  ...utilityDirectiveChromeUtilities(css),
];

/** The string literals inside `extendTailwindMerge({ … })`'s call, paren-matched, filtered to `*-chrome-*` names. */
const registeredChromeUtilities = (source: string): readonly string[] => {
  const callStart = source.indexOf('extendTailwindMerge(');
  if (callStart === -1) return [];
  const body = bracketBody(source, source.indexOf('(', callStart), ['(', ')']);
  if (body === undefined) return [];
  return [...body.matchAll(/'([\w-]+)'/gu)]
    .map((match) => match[1])
    .filter((name): name is string => name?.includes('chrome') ?? false);
};

describe('the theme and cn() agree on the class-generating chrome utilities', () => {
  it('registers exactly the utilities the theme emits, and emits exactly the utilities cn() registers', () => {
    const themeNames = [
      ...new Set(themeClassGeneratingChromeUtilities(maskedCssSource(LIVE_THEME))),
    ].sort();
    const registeredNames = [
      ...new Set(registeredChromeUtilities(maskedTsSource('packages/ui/src/lib/utils.ts'))),
    ].sort();

    const missingFromRegistration = themeNames.filter((name) => !registeredNames.includes(name));
    const missingFromTheme = registeredNames.filter((name) => !themeNames.includes(name));

    expect({ missingFromRegistration, missingFromTheme }).toEqual({
      missingFromRegistration: [],
      missingFromTheme: [],
    });
    expect(unmappedThemeChromeKeys(maskedCssSource(LIVE_THEME))).toEqual([]);
    // The two lists are non-empty in the first place — an early return from
    // either parser would otherwise report agreement on nothing.
    expect(themeNames.length).toBeGreaterThan(0);
  });

  it('never treats a direct :root property as class-generating', () => {
    const themeNames = themeClassGeneratingChromeUtilities(maskedCssSource(LIVE_THEME));
    expect(themeNames).not.toContain('shadow-chrome-elevated');
    expect(themeNames).not.toContain('shadow-chrome-lifted');
    expect(themeNames).not.toContain('border-width-chrome-accent');
  });
});

describe('arm 4 — the theme and cn() registration lists (fixture proof)', () => {
  it('reads a @theme inline chrome key as its generated utility name', () => {
    const theme = '@theme inline {\n  --radius-chrome-2xs: 0;\n  --text-chrome-sm: 0.85rem;\n}\n';
    expect([...themeClassGeneratingChromeUtilities(theme)].sort()).toEqual([
      'rounded-chrome-2xs',
      'text-chrome-sm',
    ]);
  });

  it('reads every @theme block, plain or inline, first or not', () => {
    const theme =
      '@theme inline {\n  --radius-chrome-md: 0;\n}\n:root {\n  --x: 0;\n}\n@theme {\n  --text-chrome-lg: 1rem;\n}\n@theme inline {\n  --font-weight-chrome-strong: 700;\n}\n';
    expect([...themeClassGeneratingChromeUtilities(theme)].sort()).toEqual([
      'font-chrome-strong',
      'rounded-chrome-md',
      'text-chrome-lg',
    ]);
  });

  it('reads a @theme shadow key as its generated shadow utility', () => {
    const theme = '@theme inline {\n  --shadow-chrome-lifted: 10px 10px 0 var(--foreground);\n}\n';
    expect(themeClassGeneratingChromeUtilities(theme)).toEqual(['shadow-chrome-lifted']);
  });

  it('reports a @theme chrome key in a namespace the scan does not map', () => {
    const theme = '@theme {\n  --spacing-chrome-gap: 4px;\n  --color-chrome-ink: #000;\n}\n';
    expect(unmappedThemeChromeKeys(theme)).toEqual(['--spacing-chrome-gap']);
  });

  it("merges a colour utility without registration, which is why a colour key is not on cn()'s list", () => {
    expect(cn('bg-card', 'bg-chrome-probe')).toBe('bg-chrome-probe');
    expect(cn('text-foreground', 'text-chrome-probe')).toBe('text-chrome-probe');
  });

  it('keeps a built-in step beside an unregistered chrome word, which is why a mapped key must be registered', () => {
    expect(cn('shadow-lg', 'shadow-chrome-probe')).toBe('shadow-lg shadow-chrome-probe');
    expect(cn('rounded-lg', 'rounded-chrome-probe')).toBe('rounded-lg rounded-chrome-probe');
  });

  it('reads an @utility directive as a class-generating chrome utility', () => {
    const theme =
      '@utility border-chrome-accent {\n  border-width: var(--border-width-chrome-accent);\n}\n';
    expect(themeClassGeneratingChromeUtilities(theme)).toEqual(['border-chrome-accent']);
  });

  it('does not read a direct :root custom property as class-generating', () => {
    const theme =
      ':root {\n  --shadow-chrome-elevated: 6px 6px 0 var(--foreground);\n  --border-width-chrome-accent: 3px;\n}\n';
    expect(themeClassGeneratingChromeUtilities(theme)).toEqual([]);
  });

  it("does not read Tailwind's own, non-chrome theme step as a chrome utility", () => {
    const theme = '@theme inline {\n  --radius-sm: 0;\n  --radius-md: 0;\n}\n';
    expect(themeClassGeneratingChromeUtilities(theme)).toEqual([]);
  });

  it('reports a theme utility with no registration, and vice versa', () => {
    const themeNames = themeClassGeneratingChromeUtilities(
      '@theme inline {\n  --radius-chrome-2xs: 0;\n}\n',
    );
    const registeredNames = registeredChromeUtilities(
      "extendTailwindMerge({ extend: { classGroups: { rounded: ['rounded-chrome-ghost'] } } });\n",
    );
    expect(themeNames).toEqual(['rounded-chrome-2xs']);
    expect(registeredNames).toEqual(['rounded-chrome-ghost']);
    expect(themeNames).not.toEqual(registeredNames);
  });

  it('ignores a quoted string in extendTailwindMerge that is not a chrome name', () => {
    const registeredNames = registeredChromeUtilities(
      "extendTailwindMerge({ extend: { classGroups: { rounded: ['rounded-lg', 'rounded-chrome-md'] } } } );\n",
    );
    expect(registeredNames).toEqual(['rounded-chrome-md']);
  });
});
