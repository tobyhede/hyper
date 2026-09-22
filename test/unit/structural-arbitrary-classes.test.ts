import { describe, expect, it } from 'vitest';
import {
  describeViolation,
  lineAt,
  maskTsComments,
  maskedTsSource,
  scannedTsFiles,
  structuralClasses,
  type Violation,
} from '../support/structural-scan';

/**
 * Arm 1 of ticket 08's structural scan (`test/support/structural-scan.ts`
 * reads the source and states what every arm shares): a structural Tailwind
 * arbitrary value (`rounded-[6px]`, `text-[12px]`, `border-[3px]`,
 * `shadow-[…]`, `drop-shadow-[…]`) in `.ts`/`.tsx` source.
 */

/**
 * A bracket's content is a length, a percentage or a length math function
 * (`calc`, `clamp`, `min`, `max`) over them, or anything behind Tailwind's
 * `length:` type hint, which forces the length reading of an otherwise
 * ambiguous value. A number with any unit reads as a length rather than a list
 * of units, since no colour Tailwind accepts in brackets begins with a digit.
 */
const LENGTH_LIKE = /^(?:length:.*|(?:calc|clamp|min|max)\(.*\)|-?\d*\.?\d+(?:[a-z]+|%)?)$/iu;

/**
 * `text-[…]` and `border-[…]` (every side and logical variant) are the prefixes
 * Tailwind also spends on colour (`text-[color-mix(…)]`, `border-[var(--accent)]`
 * — a bare `var()` reads as a colour), so their content decides whether they
 * are this scan's business: a length is type size or border width, anything
 * else is a colour question ticket 11 owns. `font-[…]` is shared the same way
 * between weight and family, and Tailwind disambiguates it with a
 * `family-name:` type hint, so that hint is what puts one outside this scan.
 * `rounded`, `shadow` and `drop-shadow` carry no second reading, so every
 * bracket on them is reported, a fully tokenised
 * `rounded-[var(--radius-chrome-md)]` included — the named utility is how a
 * control states a step.
 */
const FONT_FAMILY_HINT = 'family-name:';

const isStructuralClassCandidate = (prefix: string, content: string): boolean => {
  if (prefix === 'text' || prefix.startsWith('border')) return LENGTH_LIKE.test(content.trim());
  if (prefix === 'font') return !content.trim().startsWith(FONT_FAMILY_HINT);
  return true;
};

interface ClassCarveOut {
  readonly description: string;
  readonly reason: string;
  readonly file: string;
  readonly matches: (prefix: string, content: string) => boolean;
}

const CLASS_CARVE_OUTS: readonly ClassCarveOut[] = [
  {
    description: "input-group.tsx's nested corner relative to --radius-md",
    reason:
      "an inner control's corner drawn a fixed offset smaller than its container's — the standard concentric-radius technique — is a nested-corner relationship to --radius-md rather than an independently authored pick, so it stays expressed relative to --radius-md instead of being pulled onto the --radius-chrome-* ladder (ticket 01).",
    file: 'packages/ui/src/components/input-group.tsx',
    matches: (prefix, content) =>
      prefix === 'rounded' && content.startsWith('calc(var(--radius-md)'),
  },
  {
    description: "PaletteColorPicker.tsx's glyph contrast outline",
    reason:
      'a 1px black outline on the selected-swatch check glyph is how the glyph stays legible against an arbitrary swatch colour the author picked, not an elevation sized for a dark canvas; ticket 10 scopes a contrast outline on a glyph out of the black-shadow ban, and it is a drop-shadow rather than a shadow for the same reason.',
    file: 'packages/ui/src/PaletteColorPicker.tsx',
    matches: (prefix, content) =>
      prefix === 'drop-shadow' && content === '0_0_1px_rgba(0,0,0,0.85)',
  },
];

const findClassViolations = (file: string, maskedSource: string): readonly Violation[] => {
  const found: Violation[] = [];
  for (const { prefix, content, index, text } of structuralClasses(maskedSource)) {
    if (!isStructuralClassCandidate(prefix, content)) continue;
    if (
      CLASS_CARVE_OUTS.some(
        (carveOut) => carveOut.file === file && carveOut.matches(prefix, content),
      )
    ) {
      continue;
    }
    found.push({ file, line: lineAt(maskedSource, index), text });
  }
  return found;
};

describe('no new structural arbitrary Tailwind value', () => {
  it('states no structural arbitrary class outside a recorded carve-out', () => {
    const found = scannedTsFiles().flatMap((file) =>
      findClassViolations(file, maskedTsSource(file)),
    );
    expect(found.map(describeViolation)).toEqual([]);
  });
});

describe('every carve-out still earns itself', () => {
  it('every class carve-out matches a real site in the file it names', () => {
    for (const carveOut of CLASS_CARVE_OUTS) {
      const source = maskedTsSource(carveOut.file);
      const earned = structuralClasses(source).some(({ prefix, content }) =>
        carveOut.matches(prefix, content),
      );
      expect(earned, `${carveOut.description} no longer matches anything`).toBe(true);
    }
  });
});

describe('arm 1 — structural Tailwind arbitrary values (fixture proof)', () => {
  it('reports a bare radius arbitrary value', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'rounded-[6px]';\n"),
    );
    expect(found).toHaveLength(1);
  });

  it('reports a bare type-size arbitrary value', () => {
    const found = findClassViolations('fixture.tsx', maskTsComments("const x = 'text-[13px]';\n"));
    expect(found).toHaveLength(1);
  });

  it('reports a bare border-width arbitrary value', () => {
    const found = findClassViolations('fixture.tsx', maskTsComments("const x = 'border-[3px]';\n"));
    expect(found).toHaveLength(1);
  });

  it('reads a length in any CSS unit, or inside any length math function, as a length', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'text-[10pt] text-[2vmin] text-[1.5dvh] border-[0.5mm] text-[clamp(12px,2vw,16px)] border-t-[min(2px,0.1em)] text-[max(1rem,2cqi)]';\n",
      ),
    );
    expect(found).toHaveLength(7);
  });

  it('reports a bare shadow arbitrary value', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'shadow-[0_6px_20px_rgba(0,0,0,0.2)]';\n"),
    );
    expect(found).toHaveLength(1);
  });

  it('ignores a named chrome utility', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'rounded-chrome-md';\n"),
    );
    expect(found).toEqual([]);
  });

  it('ignores every Tailwind state selector, even stacked on one class list', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'data-[state=open]:rounded-md has-[>svg]:pl-2 group-data-[disabled]:opacity-50 aria-[current]:font-bold supports-[gap]:flex';\n",
      ),
    );
    expect(found).toEqual([]);
  });

  it('ignores an arbitrary value written only inside a comment', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments(
        "// the old value was text-[13px] and rounded-[6px]\nconst x = 'text-chrome-sm';\n",
      ),
    );
    expect(found).toEqual([]);
  });

  it('masks a comment between two template literals with substitutions', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments(
        'const a = `x ${y}`;\n// the old value was text-[13px]\nconst b = `z ${w}`;\n',
      ),
    );
    expect(found).toEqual([]);
  });

  it('masks a comment written as a JSX expression', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments('const x = <div>{/* the old value was rounded-[6px] */}</div>;\n'),
    );
    expect(found).toEqual([]);
  });

  it('ignores a colour written as an arbitrary text value', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments(
        "const x = 'text-[color-mix(in_oklab,var(--muted-foreground)_72%,transparent)]';\n",
      ),
    );
    expect(found).toEqual([]);
  });

  it('ignores a colour written as an arbitrary border value', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'border-[var(--accent)] border-t-[#ff00ff]';\n"),
    );
    expect(found).toEqual([]);
  });

  it('ignores a utility that merely begins with a structural prefix', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'border-spacing-[4px] font-stretch-[66.66%]';\n"),
    );
    expect(found).toEqual([]);
  });

  it('ignores a font family, in either spelling — font-[…] states a weight only when nothing says otherwise', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'font-[family-name:var(--f)] font-(family-name:--g)';\n"),
    );
    expect(found).toEqual([]);
  });

  it("reports a length forced by Tailwind's length: type hint, on text and border alike", () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'text-[length:var(--x)] border-[length:var(--y)]';\n"),
    );
    expect(found).toHaveLength(2);
  });

  it('reports a fully tokenised arbitrary radius — the named utility is the way to state it', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'rounded-[var(--radius-chrome-md)]';\n"),
    );
    expect(found).toHaveLength(1);
  });

  it("reports Tailwind's parenthesised variable form exactly as its bracket var() equivalent", () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'rounded-(--radius-chrome-md) shadow-(--x) font-(--y)';\n"),
    );
    expect(found.map((violation) => violation.text)).toEqual([
      'rounded-(--radius-chrome-md)',
      'shadow-(--x)',
      'font-(--y)',
    ]);
  });

  it('reads a parenthesised text or border value as a colour unless its length: type hint says otherwise', () => {
    const colour = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'text-(--x) border-(--y) border-t-(color:--z)';\n"),
    );
    const length = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'text-(length:--x) border-(length:--y) border-t-(length:--z)';\n"),
    );
    expect(colour).toEqual([]);
    expect(length).toHaveLength(3);
  });

  it('ignores a parenthesised Tailwind state selector', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments("const x = 'supports-(--x):flex data-(--y):opacity-50';\n"),
    );
    expect(found).toEqual([]);
  });

  it('excuses the recorded input-group.tsx nested-corner calc()', () => {
    const found = findClassViolations(
      'packages/ui/src/components/input-group.tsx',
      maskTsComments('const x = "rounded-[calc(var(--radius-md)-5px)]";\n'),
    );
    expect(found).toEqual([]);
  });

  it('does not excuse the same calc() outside input-group.tsx', () => {
    const found = findClassViolations(
      'fixture.tsx',
      maskTsComments('const x = "rounded-[calc(var(--radius-md)-5px)]";\n'),
    );
    expect(found).toHaveLength(1);
  });
});
