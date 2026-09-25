import { describe, expect, it } from 'vitest';
import {
  cssDeclarations,
  describeViolation,
  findBlackShadowCssViolations,
  lineAt,
  maskCssComments,
  maskedCssSource,
  scannedCssFiles,
  type Violation,
} from '../support/structural-scan';

/**
 * Arm 2 of the structural scan (`test/support/structural-scan.ts` reads the
 * source and states what every arm shares): a bare structural
 * literal — radius, border width and shadow, plus `font-weight` and a weight
 * inside the `font` shorthand — written directly in a hand-rolled `.css` file
 * instead of read off a `var(...)`. Only `.css` files are read: a structural
 * value in a TSX style object — inline, or CodeMirror's theme in
 * `MarkdownSourceEditor.tsx` — is out of this arm's scope by decision.
 *
 * **Token definition sites are exempted by shape, not by path.** A theme
 * value is *named* in a custom property declaration (`--radius-chrome-md:
 * 6px;`) and *spent* in an ordinary property declaration
 * (`border-radius: var(--radius-chrome-md);`). This arm only ever matches a
 * real structural CSS property — `border-radius` and its corner variants,
 * `border` and its side/logical variants, `box-shadow`, `font-weight`, `font`
 * — never a `--custom-property` name, so naming a value already satisfies the
 * check regardless of which file does the naming.
 * `packages/app/src/tailwind.css` (the live theme) and the two inert
 * `tailwind-experiment-*.css` blocks both state every one of their structural
 * values this way — nothing in either file writes `border-radius:`, `border:`, `box-shadow:` or
 * `font-weight:` as an applied property, only as the name half of a `--`
 * declaration — so both are scanned like every other file rather than carved
 * out, and a fixture test below and a real-tree test in "token definition
 * sites" prove the shape does the exempting.
 */

/** Every corner, physical (`border-top-left-radius`) and logical (`border-start-start-radius`). */
const RADIUS_PROPERTY =
  /^border(?:-(?:top|bottom)-(?:left|right)|-(?:start|end)-(?:start|end))?-radius$/u;
/** Every border width property, side and logical variants included — never `-color` or `-style`. */
const BORDER_PROPERTY =
  /^border(?:-(?:top|right|bottom|left|inline(?:-start|-end)?|block(?:-start|-end)?))?(?:-width)?$/u;
const SHADOW_PROPERTY = /^box-shadow$/u;
const FONT_WEIGHT_PROPERTY = /^font-weight$/u;
const FONT_SHORTHAND_PROPERTY = /^font$/u;

const isStructuralCssProperty = (property: string): boolean =>
  RADIUS_PROPERTY.test(property) ||
  BORDER_PROPERTY.test(property) ||
  SHADOW_PROPERTY.test(property) ||
  FONT_WEIGHT_PROPERTY.test(property) ||
  FONT_SHORTHAND_PROPERTY.test(property);

/**
 * What a value that is one whole `var(...)` call falls back to: the fallback
 * text, `undefined` when it names none, and `null` when the value is not a
 * single var() call at all.
 */
const varFallback = (value: string): string | undefined | null => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('var(')) return null;
  let depth = 0;
  let comma = -1;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed.charAt(index);
    if (char === '(') depth += 1;
    if (char === ',' && depth === 1 && comma === -1) comma = index;
    if (char === ')') depth -= 1;
    if (char === ')' && depth === 0) {
      if (index !== trimmed.length - 1) return null;
      return comma === -1 ? undefined : trimmed.slice(comma + 1, index);
    }
  }
  return null;
};

/**
 * A var() is tokenised only when whatever renders if its variable is unset is
 * tokenised too: no fallback, an empty one, or a fallback that is itself a
 * tokenised var(). `var(--x, 6px)` renders `6px` whenever `--x` is undefined.
 */
const isFullyTokenized = (value: string): boolean => {
  const fallback = varFallback(value);
  if (fallback === null) return false;
  return fallback === undefined || fallback.trim() === '' || isFullyTokenized(fallback);
};

/**
 * Whether a shorthand component states a literal `pattern` matches — written
 * bare, or as the fallback of a var() however deeply nested, which is what
 * renders when the variable is unset.
 */
const statesLiteral =
  (pattern: RegExp) =>
  (component: string): boolean => {
    if (pattern.test(component)) return true;
    const fallback = varFallback(component);
    if (fallback === null || fallback === undefined) return false;
    return topLevelComponents(fallback).some(statesLiteral(pattern));
  };

/** Space-separated components at parenthesis depth zero, so `var(--a, 1px)` stays one component. */
const topLevelComponents = (value: string): readonly string[] => {
  const components: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value.trim()) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && /\s/u.test(char)) {
      if (current !== '') components.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current !== '') components.push(current);
  return components;
};

const BORDER_WIDTH_LITERAL = /^(?:-?[\d.]+[a-z%]*|thin|medium|thick)$/iu;

/**
 * The bare width literals a border declaration writes. A `-width` longhand is
 * all widths, so every component that is not a tokenised var() counts; the
 * shorthand takes its width, style and colour in any order, so only a
 * component that states a length or width keyword — bare or as a var()
 * fallback — counts, wherever it sits.
 */
const bareBorderWidths = (property: string, value: string): readonly string[] =>
  topLevelComponents(value).filter((component) =>
    property.endsWith('-width')
      ? !isFullyTokenized(component)
      : statesLiteral(BORDER_WIDTH_LITERAL)(component),
  );

/**
 * The `font` shorthand's weight is one of its components beside size, line
 * height and family, so only a component that states a standard numeric
 * weight or a weight keyword — bare or as a var() fallback — counts.
 */
const FONT_WEIGHT_LITERAL = /^(?:[1-9]00|bold|bolder|lighter)$/iu;

const isBareCssLiteral = (property: string, value: string): boolean => {
  if (BORDER_PROPERTY.test(property)) return bareBorderWidths(property, value).length > 0;
  if (FONT_SHORTHAND_PROPERTY.test(property)) {
    return topLevelComponents(value).some(statesLiteral(FONT_WEIGHT_LITERAL));
  }
  // radius, box-shadow and font-weight never mix a literal magnitude with a
  // var()-based colour the way a border shorthand does, so the whole value
  // decides for these three.
  return !isFullyTokenized(value);
};

interface CssCarveOut {
  readonly description: string;
  readonly reason: string;
  readonly matches: (file: string, property: string, value: string) => boolean;
}

const CSS_CARVE_OUTS: readonly CssCarveOut[] = [
  {
    description: 'zero or none — absence, not magnitude',
    reason:
      '`0` and `none` state that nothing is drawn — a deliberate absence of a corner, a border or a shadow — not a step on a scale: box-shadow: none says "no shadow", not "a shadow of magnitude zero" (tickets 01, 06).',
    matches: (_file, property, value) => {
      const trimmed = value.trim();
      if (BORDER_PROPERTY.test(property)) {
        const widths = bareBorderWidths(property, value);
        return widths.length > 0 && widths.every((width) => width === '0');
      }
      return trimmed === '0' || trimmed === 'none';
    },
  },
  {
    description: 'the universal 1px hairline default',
    reason:
      "1px is the border-family baseline nearly everywhere in this theme — Tailwind's own default hairline, not a value ticket 01's inventory found duplicated or varying anywhere (tickets 01, 02, 06).",
    matches: (_file, property, value) => {
      if (!BORDER_PROPERTY.test(property)) return false;
      const widths = bareBorderWidths(property, value);
      return widths.length > 0 && widths.every((width) => width === '1px');
    },
  },
  {
    description: 'border-radius: 50% — the full-circle idiom',
    reason:
      "a circle is not a step on a corner-radius ladder, the same category as Tailwind's own rounded-full (ticket 06).",
    matches: (_file, property, value) => RADIUS_PROPERTY.test(property) && value.trim() === '50%',
  },
  {
    description: 'border-radius: 999px — the full-pill idiom',
    reason: 'the same full-pill idiom, not a step on the ladder (ticket 06).',
    matches: (_file, property, value) => RADIUS_PROPERTY.test(property) && value.trim() === '999px',
  },
  {
    description: "resources-popover.css's toggle hairline shadow",
    reason:
      'a 1px separator drawn as a shadow rather than a border; its colour is theme-derived through color-mix (ticket 10), and the offset is the standard hairline shape, not a step on the elevation scale.',
    matches: (file, property, value) =>
      file === 'packages/app/src/components/resources-popover.css' &&
      SHADOW_PROPERTY.test(property) &&
      value.trim() === '0 1px 0 color-mix(in oklab, var(--foreground) 4%, transparent)',
  },
  {
    description: "command-dock.css's conflict ring",
    reason:
      'the refusal/conflict inset ring on an unwell Dock is not an elevation, so it is not on the shadow scale (ticket 12: "Neither is an elevation, so neither moves").',
    matches: (file, property, value) =>
      file === 'packages/app/src/components/command-dock.css' &&
      SHADOW_PROPERTY.test(property) &&
      value.trim() === 'inset 0 0 0 2px var(--destructive)',
  },
];

const findCssViolations = (file: string, maskedSource: string): readonly Violation[] => {
  const found: Violation[] = [];
  for (const { property, value, index } of cssDeclarations(maskedSource)) {
    if (!isStructuralCssProperty(property)) continue;
    if (!isBareCssLiteral(property, value)) continue;
    if (CSS_CARVE_OUTS.some((carveOut) => carveOut.matches(file, property, value))) continue;
    found.push({
      file,
      line: lineAt(maskedSource, index),
      text: `${property}: ${value.trim()};`,
    });
  }
  return found;
};

/**
 * Whether `carveOut` excuses at least one declaration in `maskedSource` that
 * arm 2 would otherwise report — a declaration that is not a bare structural
 * literal in the first place (`display: none`, `border: none`) earns nothing.
 */
const cssCarveOutEarnedIn = (carveOut: CssCarveOut, file: string, maskedSource: string): boolean =>
  cssDeclarations(maskedSource).some(
    ({ property, value }) =>
      isStructuralCssProperty(property) &&
      isBareCssLiteral(property, value) &&
      carveOut.matches(file, property, value),
  );

describe('no bare structural literal in hand-rolled CSS', () => {
  it('states no bare radius, border width, shadow or font-weight literal outside a recorded carve-out', () => {
    const found = scannedCssFiles().flatMap((file) =>
      findCssViolations(file, maskedCssSource(file)),
    );
    expect(found.map(describeViolation)).toEqual([]);
  });
});

describe('token definition sites are exempted by declaration shape', () => {
  it('the live theme and the two inert experiment blocks pass arm 2 untouched', () => {
    const files = [
      'packages/app/src/tailwind.css',
      'packages/app/src/tailwind-experiment-neobrutalism.css',
      'packages/app/src/tailwind-experiment-resource-geometry.css',
    ];
    for (const file of files) {
      expect(scannedCssFiles(), `${file} is expected to be a scanned file`).toContain(file);
    }
    const found = files.flatMap((file) => findCssViolations(file, maskedCssSource(file)));
    expect(found.map(describeViolation)).toEqual([]);
  });
});

describe('every carve-out still earns itself', () => {
  it('every CSS carve-out matches a real declaration somewhere in the scanned tree', () => {
    const cssFiles = scannedCssFiles();
    for (const carveOut of CSS_CARVE_OUTS) {
      const earned = cssFiles.some((file) =>
        cssCarveOutEarnedIn(carveOut, file, maskedCssSource(file)),
      );
      expect(earned, `${carveOut.description} no longer matches anything`).toBe(true);
    }
  });
});

describe('arm 2 — bare structural literal in CSS (fixture proof)', () => {
  it('reports a bare border-radius', () => {
    const found = findCssViolations('fixture.css', maskCssComments('.x { border-radius: 6px; }'));
    expect(found).toHaveLength(1);
  });

  it('ignores a tokenised border-radius', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { border-radius: var(--radius-chrome-md); }'),
    );
    expect(found).toEqual([]);
  });

  it('ignores a custom-property definition wherever it is declared — that is how a value is named', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments(':root { --my-new-radius: 6px; --my-new-shadow: 4px 4px 0 black; }'),
    );
    expect(found).toEqual([]);
  });

  it('ignores a literal written only inside a comment', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { /* border-radius: 6px; */ border-radius: var(--radius-chrome-md); }'),
    );
    expect(found).toEqual([]);
  });

  it('reports a literal written as a var() fallback, which is what renders when the variable is unset', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments(
        [
          '.a { border-radius: var(--radius-chrome-md, 6px); }',
          '.b { border-width: var(--x, 3px); }',
          '.c { box-shadow: var(--x, 0 4px 12px var(--border)); }',
          '.d { font-weight: var(--x, var(--y, 700)); }',
          '.e { border: var(--x, 3px) solid var(--border); }',
          '.f { font: var(--x, 700) 1rem/1.5 sans-serif; }',
        ].join('\n'),
      ),
    );
    expect(found.map(({ line }) => line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ignores a var() whose fallback is itself tokenised, or a colour fallback in a border shorthand', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments(
        '.a { border-radius: var(--a, var(--b)); }\n.b { border: var(--border-width-chrome-accent) solid var(--border, currentcolor); }',
      ),
    );
    expect(found).toEqual([]);
  });

  it('reports a bare font-weight', () => {
    const found = findCssViolations('fixture.css', maskCssComments('.x { font-weight: 700; }'));
    expect(found).toHaveLength(1);
  });

  it('ignores a tokenised font-weight', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { font-weight: var(--canvas-resource-title-weight); }'),
    );
    expect(found).toEqual([]);
  });

  it('ignores the universal 1px hairline default, mixed colour included', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments(
        '.x { border: 1px solid var(--border); }\n.y { border-inline-start: 1px solid color-mix(in oklab, var(--border) 80%, var(--muted-foreground)); }',
      ),
    );
    expect(found).toEqual([]);
  });

  it('reports a non-default border width even when the colour is tokenised', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { border: 3px solid var(--border); }'),
    );
    expect(found).toHaveLength(1);
  });

  it('reports a bare border width written after the colour and style', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { border: var(--border) solid 3px; }'),
    );
    expect(found).toHaveLength(1);
  });

  it('reports a bare side in a border-width longhand, whichever side it is', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { border-width: var(--border-width-chrome-accent) 2px; }'),
    );
    expect(found).toHaveLength(1);
  });

  it('reports a border-width longhand whose first side is the 1px hairline and whose second is not', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { border-width: 1px 3px; }'),
    );
    expect(found).toHaveLength(1);
  });

  it('reports a bare logical corner radius', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { border-start-start-radius: 6px; border-end-end-radius: 6px; }'),
    );
    expect(found).toHaveLength(2);
  });

  it('reports a bare weight written inside the font shorthand, numeric or keyword', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments(
        '.x { font: 700 1rem/1.5 sans-serif; }\n.y { font: bold 12px Inter, sans-serif; }',
      ),
    );
    expect(found).toHaveLength(2);
  });

  it('ignores a font shorthand that states no weight', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments(
        '.x { font: inherit; }\n.y { font: 1rem/1.5 sans-serif; }\n.z { font: var(--canvas-resource-title-weight) 1rem/1.5 sans-serif; }',
      ),
    );
    expect(found).toEqual([]);
  });

  it('ignores a border shorthand whose width is tokenised, wherever it sits', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { border: solid var(--border) var(--border-width-chrome-accent); }'),
    );
    expect(found).toEqual([]);
  });

  it('ignores a zero or none reset on border, radius or shadow', () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.a { border: none; }\n.b { border-radius: 0; }\n.c { box-shadow: none; }'),
    );
    expect(found).toEqual([]);
  });

  it("ignores border-color and border-style — colour and dash pattern are not this scan's axis", () => {
    const found = findCssViolations(
      'fixture.css',
      maskCssComments('.x { border-color: #ff00ff; border-style: dashed; }'),
    );
    expect(found).toEqual([]);
  });

  it('excuses the two recorded box-shadow carve-outs by file, and reports them elsewhere', () => {
    const declaration = '.x { box-shadow: inset 0 0 0 2px var(--destructive); }';
    const excused = findCssViolations(
      'packages/app/src/components/command-dock.css',
      maskCssComments(declaration),
    );
    const reported = findCssViolations('fixture.css', maskCssComments(declaration));
    expect(excused).toEqual([]);
    expect(reported).toHaveLength(1);
  });

  it('does not excuse a look-alike shadow in either carve-out file', () => {
    const dock = findCssViolations(
      'packages/app/src/components/command-dock.css',
      maskCssComments('.x { box-shadow: inset 0 0 0 2px var(--ring), 0 8px 24px var(--border); }'),
    );
    const popover = findCssViolations(
      'packages/app/src/components/resources-popover.css',
      maskCssComments('.x { box-shadow: 0 1px 0 12px var(--border); }'),
    );
    expect([...dock, ...popover]).toHaveLength(2);
  });

  it("reports a black colour hidden inside the token's own definition, which arm 2 alone would miss", () => {
    const declaration = ':root { --shadow-chrome-new: 6px 6px 0 rgba(0, 0, 0, 0.45); }';
    // Arm 2 sees only a custom-property definition and reports nothing.
    expect(findCssViolations('fixture.css', maskCssComments(declaration))).toEqual([]);
    // Arm 3 reads the same declaration for its colour and reports it.
    expect(findBlackShadowCssViolations('fixture.css', maskCssComments(declaration))).toHaveLength(
      1,
    );
  });
});

describe('every carve-out still earns itself (fixture proof)', () => {
  it('a CSS carve-out is not earned by a declaration arm 2 would never report', () => {
    const source = maskCssComments(
      '.a { display: none; }\n.b { margin: 0; }\n.c { border: none; }\n.d { border: var(--border-width-chrome-accent) solid var(--border); }',
    );
    const earned = CSS_CARVE_OUTS.filter((carveOut) =>
      cssCarveOutEarnedIn(carveOut, 'fixture.css', source),
    ).map((carveOut) => carveOut.description);
    expect(earned).toEqual([]);
  });

  it('a CSS carve-out is earned by a bare literal it excuses', () => {
    const source = maskCssComments('.a { border: 0; }\n.b { border: 1px solid var(--border); }');
    const earned = CSS_CARVE_OUTS.filter((carveOut) =>
      cssCarveOutEarnedIn(carveOut, 'fixture.css', source),
    ).map((carveOut) => carveOut.description);
    expect(earned).toEqual([
      'zero or none — absence, not magnitude',
      'the universal 1px hairline default',
    ]);
  });
});
