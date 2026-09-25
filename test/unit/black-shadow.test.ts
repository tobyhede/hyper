import { describe, expect, it } from 'vitest';
import {
  BLACK_SHADOW_COLOR,
  cssDeclarations,
  describeViolation,
  findBlackShadowCssViolations,
  LIVE_THEME,
  lineAt,
  maskCssComments,
  maskTsComments,
  maskedCssSource,
  maskedTsSource,
  scannedCssFiles,
  scannedTsFiles,
  structuralClasses,
  themeBlocks,
  type Violation,
} from '../support/structural-scan';

/**
 * Arm 3 of the structural scan (`test/support/structural-scan.ts` reads the
 * source and states what every arm shares): no shadow, anywhere, states its
 * colour as black — in CSS, in a `shadow-[…]` class or as Tailwind's
 * `shadow-black` colour utility — including inside a token's own definition,
 * which arm 2 alone cannot see (a value fully wrapped in `var(...)` passes arm
 * 2 even when the token it names is the offender). The CSS half,
 * `findBlackShadowCssViolations`, lives in the support module because arm 2's
 * fixtures prove that blind spot with it.
 */

/**
 * Tailwind's named shadow-colour utility in black, opacity modifier and
 * variant prefix included. `inset-shadow` and `text-shadow` have the same
 * utility and are held to the same rule as `shadow`; `drop-shadow-black` is
 * a glyph outline and out of scope, and a bare `shadow-black` behind
 * any other word (`drop-`, `blah-`) is not this utility at all.
 */
const BLACK_SHADOW_COLOR_CLASS =
  /(?<![\w-])(?:inset-|text-)?shadow-black(?:\/[\w.%[\]]+)?(?![\w-])/gu;

/**
 * `shadow-[…]` and `shadow-black…` only — `drop-shadow-[…]` is a glyph's
 * contrast outline, not an elevation.
 */
const findBlackShadowClassViolations = (
  file: string,
  maskedSource: string,
): readonly Violation[] => {
  const found: Violation[] = [];
  for (const { prefix, content, index, text } of structuralClasses(maskedSource)) {
    if (prefix !== 'shadow' || !BLACK_SHADOW_COLOR.test(content)) continue;
    found.push({ file, line: lineAt(maskedSource, index), text });
  }
  for (const match of maskedSource.matchAll(BLACK_SHADOW_COLOR_CLASS)) {
    found.push({ file, line: lineAt(maskedSource, match.index), text: match[0] });
  }
  return found;
};

/**
 * Tailwind's named shadow steps, per family, as its own `theme.css` defines
 * them — every one in `rgb(0 0 0 / …)`, so a named step is black unless the
 * theme restates it, which a scan of the literals written in source cannot
 * see. `inset-shadow`, `text-shadow` and `drop-shadow` are not elevations, and
 * are held to the same rule by decision.
 */
const SHADOW_STEPS_BY_FAMILY: ReadonlyMap<string, readonly string[]> = new Map([
  ['shadow', ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl']],
  ['inset-shadow', ['2xs', 'xs', 'sm']],
  ['text-shadow', ['2xs', 'xs', 'sm', 'md', 'lg']],
  ['drop-shadow', ['xs', 'sm', 'md', 'lg', 'xl', '2xl']],
]);

const SHADOW_FAMILIES = [...SHADOW_STEPS_BY_FAMILY.keys()].join('|');

/** A named step in any family, variant prefix and opacity modifier included; `[1]` is the family, `[2]` the step. */
const NAMED_SHADOW_STEP_CLASS = new RegExp(
  `(?<![\\w-])(${SHADOW_FAMILIES})-([0-9]?x?[a-z]+)(?![\\w-])`,
  'gu',
);

const THEME_SHADOW_STEP_KEY = new RegExp(`^--((?:${SHADOW_FAMILIES})-[0-9]?x?[a-z]+)$`, 'u');

const isNamedShadowStep = (family: string, step: string): boolean =>
  SHADOW_STEPS_BY_FAMILY.get(family)?.includes(step) ?? false;

/** `--<family>-<step>` as the theme's `@theme` blocks restate it, keyed `<family>-<step>`. */
const themeShadowSteps = (css: string): ReadonlyMap<string, string> => {
  const steps = new Map<string, string>();
  for (const block of themeBlocks(css)) {
    for (const { property, value } of cssDeclarations(block)) {
      const key = THEME_SHADOW_STEP_KEY.exec(property)?.[1];
      if (key !== undefined) steps.set(key, value.trim());
    }
  }
  return steps;
};

const findUnrestatedShadowStepViolations = (
  file: string,
  maskedSource: string,
  themeSteps: ReadonlyMap<string, string>,
): readonly Violation[] => {
  const found: Violation[] = [];
  for (const match of maskedSource.matchAll(NAMED_SHADOW_STEP_CLASS)) {
    const [wholeMatch, family, step] = match;
    if (family === undefined || step === undefined || !isNamedShadowStep(family, step)) continue;
    const value = themeSteps.get(`${family}-${step}`);
    if (value !== undefined && !BLACK_SHADOW_COLOR.test(value)) continue;
    found.push({ file, line: lineAt(maskedSource, match.index), text: wholeMatch });
  }
  return found;
};

describe('no elevation shadow is coloured black (ticket 10)', () => {
  it('states no black-coloured box-shadow, custom shadow property or shadow-[…] class', () => {
    const cssFound = scannedCssFiles().flatMap((file) =>
      findBlackShadowCssViolations(file, maskedCssSource(file)),
    );
    const classFound = scannedTsFiles().flatMap((file) =>
      findBlackShadowClassViolations(file, maskedTsSource(file)),
    );
    expect([...cssFound, ...classFound].map(describeViolation)).toEqual([]);
  });

  it("states no named shadow step the theme leaves at Tailwind's black default", () => {
    const themeSteps = themeShadowSteps(maskedCssSource(LIVE_THEME));
    const found = scannedTsFiles().flatMap((file) =>
      findUnrestatedShadowStepViolations(file, maskedTsSource(file), themeSteps),
    );
    expect(found.map(describeViolation)).toEqual([]);
  });
});

describe('arm 3 — no elevation shadow is coloured black (fixture proof)', () => {
  it('reports a box-shadow whose colour is rgba(0,0,0,…)', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments('.x { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45); }'),
    );
    expect(found).toHaveLength(1);
  });

  it('reports an opaque rgb(0 0 0) and the black keyword, in a use site and a token definition', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments(
        '.x { box-shadow: 0 6px 20px rgb(0 0 0); }\n:root { --shadow-chrome-new: 4px 4px 0 black; }',
      ),
    );
    expect(found).toHaveLength(2);
  });

  it('reports a comma-separated opaque rgb(0,0,0), a zero-lightness oklch and black hex with an alpha channel', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments(
        '.a { box-shadow: 0 6px 20px rgb(0,0,0); }\n.b { box-shadow: 0 6px 20px oklch(0% 0 0 / 40%); }\n.c { box-shadow: 0 6px 20px #00000080; }\n.d { box-shadow: 0 6px 20px #0008; }',
      ),
    );
    expect(found).toHaveLength(4);
  });

  it('reports black written as hsl, hwb, lab, lch or color()', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments(
        [
          '.a { box-shadow: 0 1px 0 hsl(0 0% 0%); }',
          '.b { box-shadow: 0 1px 0 hsla(217, 100%, 0%, 0.4); }',
          '.c { box-shadow: 0 1px 0 hsl(120deg 50% 0 / 40%); }',
          '.d { box-shadow: 0 1px 0 hwb(0 0% 100%); }',
          '.e { box-shadow: 0 1px 0 lab(0 0 0); }',
          '.f { box-shadow: 0 1px 0 lch(0% 0 0 / 50%); }',
          '.g { box-shadow: 0 1px 0 color(srgb 0 0 0); }',
          '.h { box-shadow: 0 1px 0 color(display-p3 0 0 0 / 0.5); }',
        ].join('\n'),
      ),
    );
    expect(found).toHaveLength(8);
  });

  it('ignores a non-black hsl, hwb, lab, lch or color()', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments(
        [
          '.a { box-shadow: 0 1px 0 hsl(0 0% 50%); }',
          '.b { box-shadow: 0 1px 0 hsl(0, 0%, 0.5%); }',
          '.c { box-shadow: 0 1px 0 hwb(0 10% 100%); }',
          '.d { box-shadow: 0 1px 0 hwb(0 0% 50%); }',
          '.e { box-shadow: 0 1px 0 lab(50 0 0); }',
          '.f { box-shadow: 0 1px 0 lch(0.5% 0 0); }',
          '.g { box-shadow: 0 1px 0 color(srgb 0 0 0.5); }',
        ].join('\n'),
      ),
    );
    expect(found).toEqual([]);
  });

  it('ignores a hex colour that only begins with zeros', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments('.a { box-shadow: 0 1px 0 #0000ff; }\n.b { box-shadow: 0 1px 0 #000abc; }'),
    );
    expect(found).toEqual([]);
  });

  it('ignores a custom property that merely names black', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments('.x { box-shadow: 0 1px 0 var(--color-black); }'),
    );
    expect(found).toEqual([]);
  });

  it('ignores a theme-derived shadow', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments('.x { box-shadow: var(--shadow-chrome-elevated); }'),
    );
    expect(found).toEqual([]);
  });

  it('ignores a non-shadow property, however dark its colour', () => {
    const found = findBlackShadowCssViolations(
      'fixture.css',
      maskCssComments('.x { background: rgba(0, 0, 0, 0.9); }'),
    );
    expect(found).toEqual([]);
  });

  it("reports a black arbitrary shadow class, Tailwind's underscore spelling included", () => {
    const found = findBlackShadowClassViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'shadow-[0_6px_20px_rgb(0_0_0/45%)]';\nconst y = 'shadow-[4px_4px_0_black]';\n",
      ),
    );
    expect(found).toHaveLength(2);
  });

  it('reports a black arbitrary shadow whose colour is written first', () => {
    const found = findBlackShadowClassViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'shadow-[#000_0_4px_8px]';\nconst y = 'shadow-[#000000_0_4px_8px]';\nconst z = 'shadow-[#0008_0_4px_8px]';\n",
      ),
    );
    expect(found).toHaveLength(3);
  });

  it("reports Tailwind's black shadow-colour utility, with an opacity modifier and behind a variant", () => {
    const found = findBlackShadowClassViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'shadow-lg shadow-black';\nconst y = 'shadow-black/40';\nconst z = 'hover:shadow-black/40';\n",
      ),
    );
    expect(found).toHaveLength(3);
  });

  it("reports the inset-shadow and text-shadow families' black colour utility", () => {
    const found = findBlackShadowClassViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'inset-shadow-black';\nconst y = 'text-shadow-black/40';\nconst z = 'hover:inset-shadow-black/40';\n",
      ),
    );
    expect(found).toHaveLength(3);
  });

  it('ignores a class that only begins with shadow-black, and black on anything but a shadow', () => {
    const found = findBlackShadowClassViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'shadow-blackish drop-shadow-black bg-black/40 text-black shadow-lg';\n",
      ),
    );
    expect(found).toEqual([]);
  });

  it('reports a named shadow step the theme does not restate, or restates in black', () => {
    const themeSteps = themeShadowSteps(
      maskCssComments('@theme inline { --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1); }'),
    );
    const found = findUnrestatedShadowStepViolations(
      'fixture.tsx',
      maskTsComments("const x = 'shadow-lg hover:shadow-md shadow-sm/50';\n"),
      themeSteps,
    );
    expect(found.map((violation) => violation.text)).toEqual([
      'shadow-lg',
      'shadow-md',
      'shadow-sm',
    ]);
  });

  it("reports a named inset-shadow, text-shadow or drop-shadow step left at Tailwind's black", () => {
    const themeSteps = themeShadowSteps(
      maskCssComments('@theme inline { --drop-shadow-lg: 0 4px 4px rgb(0 0 0 / 0.15); }'),
    );
    const found = findUnrestatedShadowStepViolations(
      'fixture.tsx',
      maskTsComments("const x = 'inset-shadow-sm hover:text-shadow-md drop-shadow-lg';\n"),
      themeSteps,
    );
    expect(found.map((violation) => violation.text)).toEqual([
      'inset-shadow-sm',
      'text-shadow-md',
      'drop-shadow-lg',
    ]);
  });

  it('ignores a named step the theme restates off black, and a step or class no family names', () => {
    const ink = 'color-mix(in oklab, var(--foreground) 10%, transparent)';
    const themeSteps = themeShadowSteps(
      maskCssComments(
        `@theme { --shadow-lg: 0 10px 15px -3px ${ink}; --inset-shadow-sm: inset 0 2px 4px ${ink}; --text-shadow-md: 0px 1px 1px ${ink}; --drop-shadow-lg: 0 4px 4px ${ink}; }`,
      ),
    );
    const found = findUnrestatedShadowStepViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'shadow-lg inset-shadow-sm text-shadow-md drop-shadow-lg shadow-none inset-shadow-lg drop-shadow-2xs shadow-chrome-lifted';\n",
      ),
      themeSteps,
    );
    expect(found).toEqual([]);
  });

  it("ignores a black drop-shadow — a glyph's contrast outline is not an elevation", () => {
    const found = findBlackShadowClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'drop-shadow-[0_0_1px_rgba(0,0,0,0.85)]';\n"),
    );
    expect(found).toEqual([]);
  });
});
