import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * The source reading the structural scale's checks share. The chrome has one
 * named scale for radius, border width, font weight and type size, and the
 * Resource its own, deliberately separate, scale for radius, border width,
 * font weight and shadow. These checks read both source trees and fail a build
 * that adds a new arbitrary value or bare literal to either scale. They do so
 * in four arms, one test file each:
 *
 * 1. `test/unit/structural-arbitrary-classes.test.ts`
 * 2. `test/unit/structural-css-literals.test.ts`
 * 3. `test/unit/black-shadow.test.ts`
 * 4. `test/unit/chrome-utility-registration.test.ts`
 *
 * and `test/unit/structural-scan.test.ts` holds what this module itself owes.
 *
 * Written in the idiom `command-surface-sharing.test.ts`,
 * `codemirror-encapsulation.test.ts` and `graph-package-surface.test.ts`
 * share for a claim a rendering test cannot make: read the
 * tracked source, not a snapshot of what it currently draws.
 *
 * **Comments do not count.** A comment may name a value the code does not
 * use, so `.ts`/`.tsx` source is parsed and every comment
 * node's range is blanked to whitespace before any pattern runs over it;
 * `.css` source has its `/* … *\/` comments blanked the same way. Blanking
 * rather than deleting keeps every reported line number true to the original
 * file.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** The index modes of an ordinary blob; a tracked symlink is `120000`. */
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

/** The repository's tracked regular files, repo-root-relative. */
const trackedFiles = (): readonly string[] =>
  execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .flatMap((entry) => {
      const separator = entry.indexOf('\t');
      if (separator === -1) return [];
      return REGULAR_FILE_MODES.has(entry.slice(0, 6)) ? [entry.slice(separator + 1)] : [];
    });

/**
 * The two source trees: `.tsx`/`.ts` class strings and
 * hand-rolled `.css` under `packages/*\/src` — the same root
 * `command-surface-sharing.test.ts` and `codemirror-encapsulation.test.ts`
 * read, and the one `docs/agents/ui.md` names as where product appearance is
 * either `@project/ui`, colocated with its component, or `styles.css`.
 * `packages/*\/stories` and `test/**` are deliberately outside it: a story or
 * a fixture is not a surface the product draws.
 */
const isScannedSourceFile = (file: string): boolean => /^packages\/[^/]+\/src\//u.test(file);

export const scannedTsFiles = (): readonly string[] =>
  trackedFiles()
    .filter(isScannedSourceFile)
    .filter((file) => /\.tsx?$/u.test(file))
    .sort();

export const scannedCssFiles = (): readonly string[] =>
  trackedFiles()
    .filter(isScannedSourceFile)
    .filter((file) => file.endsWith('.css'))
    .sort();

const read = (file: string): string =>
  readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

/** Every line of `text` up to `index`, so a reported hit names a real line. */
export const lineAt = (text: string, index: number): number =>
  text.slice(0, index).split('\n').length;

/**
 * Blank every `//` and `/* *\/` comment in TypeScript/TSX source to spaces,
 * newlines kept, using a real parse rather than the bare scanner or a regex.
 *
 * Two shapes need that parse. A comment between two template literals that
 * carry a `${…}` substitution must be read as a comment, which a bare scanner
 * cannot do because nothing re-enters the template after the substitution. A
 * JSX comment (`{/* … *\/}`) is the *trailing* comment of its `{`, not the
 * leading comment of the `}`, so every leaf is read both ways. The two
 * "masks a comment" fixtures in `structural-arbitrary-classes.test.ts` hold
 * those shapes; the JSX one fails when the trailing read is dropped.
 */
export const maskTsComments = (
  text: string,
  scriptKind: ts.ScriptKind = ts.ScriptKind.TSX,
): string => {
  const sourceFile = ts.createSourceFile(
    'scan-source.tsx',
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const chars = text.split('');
  const blank = (range: ts.CommentRange): void => {
    for (let i = range.pos; i < range.end; i += 1) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  };
  const blankComments = (node: ts.Node): void => {
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) blank(range);
      for (const range of ts.getTrailingCommentRanges(text, node.getEnd()) ?? []) blank(range);
      return;
    }
    for (const child of children) blankComments(child);
  };
  blankComments(sourceFile);
  return chars.join('');
};

/** `.ts` and `.tsx` parse under different grammars — a `.ts` file's own `<T>` type syntax is ambiguous with JSX. */
const scriptKindFor = (file: string): ts.ScriptKind =>
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

/** Blank every `/* *\/` comment in CSS source to spaces, newlines kept. CSS has no `//` form. */
export const maskCssComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//gu, (comment) => comment.replace(/[^\n]/gu, ' '));

/** A tracked `.ts`/`.tsx` file with its comments masked under its own grammar. */
export const maskedTsSource = (file: string): string =>
  maskTsComments(read(file), scriptKindFor(file));

/** A tracked `.css` file with its comments masked. */
export const maskedCssSource = (file: string): string => maskCssComments(read(file));

/** The live theme: every `@theme` block and `@utility` directive arm 3 and arm 4 read. */
export const LIVE_THEME = 'packages/app/src/tailwind.css';

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

export const describeViolation = (violation: Violation): string =>
  `${violation.file}:${violation.line}: ${violation.text.trim()}`;

/**
 * The five structural utility prefixes (radius, border width,
 * type size, shadow and its offset — shadow and offset are one composite
 * value, so one prefix covers both) plus `font`, held apart from `drop-shadow`
 * because a drop-shadow on a glyph is a contrast outline, not an elevation,
 * and arm 3 reads the two differently.
 *
 * **Each prefix admits its own variants and no more.** `rounded` takes a side
 * or a corner (`rounded-t-[…]`, `rounded-ss-[…]`), `border` takes a side or an
 * axis (`border-t-[…]`, `border-x-[…]`, `border-s-[…]`) — Tailwind spells the
 * logical ones `s`/`e`, never `border-inline-start` — and `font`, `text`,
 * `shadow` and `drop-shadow` take none. A `(?:-[a-z]+)*` tail would admit any
 * unrelated utility that merely begins the same way — `border-spacing-[4px]`
 * would read as a border width and fail the build as one — which the fixtures
 * in `structural-arbitrary-classes.test.ts` hold.
 *
 * **A Tailwind state selector is not a structural value.** `data-[…]`,
 * `has-[…]`, `group-data-[…]`, `aria-[…]` and `supports-[…]` all carry a
 * bracket, and several can stack on one class list. Anchoring the pattern to
 * the structural utility prefixes means a state selector's own prefix
 * (`data`, `has`, `group-data`, `aria`, `supports`) never matches it; nothing
 * excludes them by name.
 *
 * **Tailwind's parenthesised form is the bracket form's shorthand.**
 * `rounded-(--x)` is `rounded-[var(--x)]` and `text-(length:--x)` is
 * `text-[length:var(--x)]`, so the pattern matches both and
 * `structuralClasses` hands every arm the bracket spelling's content either
 * way; the fixtures pairing the two in `structural-arbitrary-classes.test.ts`
 * hold that.
 */
export const STRUCTURAL_CLASS =
  /\b(rounded(?:-[a-z]{1,2})?|border(?:-[a-z])?|shadow|drop-shadow|font|text)-(?:\[([^\]]*)\]|\(((?:[a-z-]+:)?--[^)]*)\))/gu;

export interface StructuralClass {
  readonly prefix: string;
  /** The bracket spelling's content: a parenthesised `(hint:--x)` reads as `hint:var(--x)`. */
  readonly content: string;
  readonly index: number;
  readonly text: string;
}

const bracketContent = (parenthesised: string): string =>
  parenthesised.replace(/^((?:[a-z-]+:)?)(--.*)$/u, '$1var($2)');

/** Every `STRUCTURAL_CLASS` match in `source`, in either spelling. */
export const structuralClasses = (source: string): readonly StructuralClass[] =>
  [...source.matchAll(STRUCTURAL_CLASS)].flatMap((match) => {
    const [text, prefix, bracketed, parenthesised] = match;
    if (prefix === undefined) return [];
    const content =
      bracketed ?? (parenthesised === undefined ? undefined : bracketContent(parenthesised));
    return content === undefined ? [] : [{ prefix, content, index: match.index, text }];
  });

/** `property: value;`, value spanning newlines (a token's own value often does). */
const CSS_DECLARATION = /(--[a-zA-Z][\w-]*|[a-zA-Z-]+)\s*:\s*([^;{}]*);/gu;

export interface CssDeclaration {
  readonly property: string;
  readonly value: string;
  readonly index: number;
}

export const cssDeclarations = (maskedSource: string): readonly CssDeclaration[] =>
  [...maskedSource.matchAll(CSS_DECLARATION)].flatMap((match) => {
    const [, property, value] = match;
    return property === undefined || value === undefined
      ? []
      : [{ property, value, index: match.index }];
  });

/** One channel of a colour function, up to the next separator. */
const CHANNEL = String.raw`[^\s_,/)]+`;
/** A channel separator: space, Tailwind's `_` for space, or a legacy comma. */
const SEP = String.raw`[\s_,]+`;
/** A zero channel, closed by a separator, an alpha slash or the function's end. */
const ZERO = String.raw`0%?(?=[\s_,/)])`;

/**
 * Every spelling of black a shadow's colour can take, Tailwind's `_`-for-space
 * arbitrary spelling included: `#000`, `#000000` and their alpha forms
 * `#000a`/`#000000aa`; the `black` keyword; and each colour function at its
 * black point.
 */
const BLACK_SPELLINGS: readonly string[] = [
  /** `rgba(0,0,0,…)`, `rgb(0 0 0/…)`, opaque `rgb(0 0 0)`. */
  String.raw`rgba?\(\s*${ZERO}${SEP}${ZERO}${SEP}${ZERO}`,
  /** `hsl`/`hsla` at zero lightness, the third channel, whatever the hue and saturation. */
  String.raw`hsla?\(\s*${CHANNEL}${SEP}${CHANNEL}${SEP}${ZERO}`,
  /** `hwb` with no whiteness and full blackness. */
  String.raw`hwb\(\s*${CHANNEL}${SEP}${ZERO}${SEP}100%?(?=[\s_/)])`,
  /** `lab`/`lch`/`oklab`/`oklch` at zero lightness, the first channel. */
  String.raw`(?:ok)?l(?:ab|ch)\(\s*${ZERO}`,
  /** `color()` in an RGB space with every channel zero. */
  String.raw`color\(\s*(?:srgb(?:-linear)?|display-p3)${SEP}${ZERO}${SEP}${ZERO}${SEP}${ZERO}`,
  /**
   * `#000`/`#000000` and their alpha forms. The tail is a negative lookahead
   * rather than a `\b`: Tailwind writes a shadow's spaces as `_`, which is a
   * word character, so `shadow-[#000_0_4px]` — black written before the
   * offsets — offered no boundary at all and read as not-black.
   */
  String.raw`#000(?:[\da-f]|000(?:[\da-f]{2})?)?(?![\da-f])`,
  String.raw`(?<![a-z0-9-])black(?![a-z0-9-])`,
];

export const BLACK_SHADOW_COLOR = new RegExp(BLACK_SPELLINGS.join('|'), 'iu');

/**
 * Every declaration whose *property name* carries "shadow" — `box-shadow`
 * itself and any `--…-shadow-…` custom property — so a black colour baked
 * into a token's own definition is caught as well as one written at a use
 * site. Arm 2 cannot see this: a use site reading `var(--shadow-chrome-new)`
 * is fully tokenized and passes arm 2 even when `--shadow-chrome-new` is
 * itself defined in black. Arm 3's, shared because arm 2's fixtures prove the
 * blind spot it covers.
 */
export const findBlackShadowCssViolations = (
  file: string,
  maskedSource: string,
): readonly Violation[] => {
  const found: Violation[] = [];
  for (const { property, value, index } of cssDeclarations(maskedSource)) {
    if (!/shadow/iu.test(property)) continue;
    if (!BLACK_SHADOW_COLOR.test(value)) continue;
    found.push({
      file,
      line: lineAt(maskedSource, index),
      text: `${property}: ${value.trim()};`,
    });
  }
  return found;
};

/**
 * The text between the bracket that opens at `open` and the one that closes
 * it, depth counted; `undefined` when it never closes.
 */
export const bracketBody = (
  text: string,
  open: number,
  [opening, closing]: readonly [string, string],
): string | undefined => {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === opening) depth += 1;
    else if (text[i] === closing) {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return undefined;
};

/** The body of every top-level `@theme` block — plain, `inline` or any other option — brace-matched. */
export const themeBlocks = (css: string): readonly string[] =>
  [...css.matchAll(/@theme\b[^{;]*\{/gu)].flatMap((match) => {
    const body = bracketBody(css, match.index + match[0].length - 1, ['{', '}']);
    return body === undefined ? [] : [body];
  });
