import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0083 puts structure inside a `string`, and nothing in the type says so.
 *
 * That is the cost the ADR accepts, and this is what it is paid with: the
 * reading of a Title is a named domain operation in `@project/core` rather than
 * a `split('\n')` at each of the surfaces that draw, list or search a Card. The
 * compiler cannot help — every one of those call sites has a `string` in hand
 * and every one of them would compile — so the containment is read off the
 * source, in the idiom `codemirror-encapsulation.test.ts` already established
 * here for an encapsulation a type cannot express.
 *
 * Two rules, and they are the same rule twice: **only the Card front reads a
 * Title's later lines.** Everywhere else shows the name, which is `titleName`,
 * and `titleName` is deliberately unrestricted — it is the answer, not the
 * thing being contained.
 *
 * Scoped to the packages' `src` trees, which is where a surface lives. A test
 * that writes a two-line Title and splits the rendered result apart is reading
 * its own output rather than a Card's Title, and a rule that reported it would
 * be teaching nothing.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Where a Title's later lines may be read.
 *
 * Two files, and nothing wider. The Card front draws the ladder and is the only
 * surface that does (ADR 0083); `@project/core`'s own module is where the rule
 * lives and is what every other reader goes through. The render adapter mounts
 * that front on the canvas and once held a whole-tree permission for it, which
 * it never spent — it hands `CanvasCard` a Title and reads no line of one — so
 * the permission went rather than standing as a region-wide hole with a reason
 * attached to it. Every entry here is asserted below to still be reading a
 * Title's lines, which is what a tree could not be held to file by file.
 */
const LADDER_READERS: readonly string[] = [
  'packages/core/src/title.ts',
  'packages/ui/src/CanvasCard.tsx',
];

/**
 * A newline split that is not a Title's.
 *
 * A **file** exemption, because a `split` carries no shape saying what it is
 * splitting — the string is a `string` either way, which is the whole reason
 * this file exists. It is asserted below to still be earning itself, so
 * deleting the split deletes the exemption rather than leaving a hole.
 */
const NOT_A_TITLE: readonly string[] = ['packages/graph/src/card-file.ts'];

/**
 * Reading a Title apart at a line break, however the break is found.
 *
 * `split` is the obvious spelling and it is not the only one. `indexOf` is what
 * `titleName` is itself written in, so it is what a call site that re-derives a
 * name arrives at by copying the module it should have called — and a rule blind
 * to that spelling would be blind to the one duplication it most exists to
 * catch. The regex-literal arm takes any pattern holding a line break, flags and
 * all, rather than the two spellings someone happened to think of.
 *
 * Escaped once for the regex and once for the TypeScript string it is read out
 * of, which is why the `\\n` here means the two characters a source file holds.
 */
const NEWLINE_READ =
  /\.(?:split|indexOf|lastIndexOf)\(\s*(?:'\\n'|"\\n"|`\\n`|\/[^/\n]*\\n[^/\n]*\/)/u;

/**
 * A **call** to the ladder reader, rather than the bare word.
 *
 * Prose has to be able to name the operation it is telling a reader to use, and
 * the modules that own the rule explain it at length. The call is what a
 * surface would write.
 */
const LADDER_CALL = /\btitleLines\s*\(/u;

const sourcesUnder = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourcesUnder(path);
    const source = entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'));
    return source ? [path] : [];
  });

/** Every package's own source tree, as repository-relative paths. */
const packageSources = (): readonly string[] =>
  readdirSync(join(repoRoot, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const src = join(repoRoot, 'packages', entry.name, 'src');
      return sourcesUnder(src).map((path) => relative(repoRoot, path));
    });

/** The files matching `pattern`, named the way this file names them. */
const reaching = (files: readonly string[], pattern: RegExp): readonly string[] =>
  files.filter((file) => pattern.test(readFileSync(join(repoRoot, file), 'utf8')));

const isLadderReader = (file: string): boolean => LADDER_READERS.includes(file);

describe('only the Card front reads a Title’s later lines', () => {
  const sources = packageSources();

  it('reads every package’s own source tree', () => {
    // A file list that quietly stopped resolving would report nothing forever.
    expect(sources.length).toBeGreaterThan(100);
    for (const owner of [...LADDER_READERS, 'packages/app/src/titles.ts']) {
      expect(sources).toContain(owner);
    }
  });

  it('recognises the shapes it is written to catch', () => {
    expect(NEWLINE_READ.test(String.raw`const lines = title.split('\n');`)).toBe(true);
    expect(NEWLINE_READ.test(String.raw`title.split("\n").map(read)`)).toBe(true);
    expect(NEWLINE_READ.test(String.raw`title.split(/\r?\n/)`)).toBe(true);
    expect(NEWLINE_READ.test(String.raw`title.split(/\n/gu)`)).toBe(true);
    // The spelling `titleName` is written in, which is the one a call site that
    // copies it rather than calling it arrives at.
    expect(NEWLINE_READ.test(String.raw`const break_ = title.indexOf('\n');`)).toBe(true);
    expect(NEWLINE_READ.test(String.raw`title.lastIndexOf('\n')`)).toBe(true);
    expect(NEWLINE_READ.test(String.raw`title.split(', ')`)).toBe(false);
    expect(NEWLINE_READ.test(String.raw`titles.indexOf(card.title)`)).toBe(false);
    expect(LADDER_CALL.test('const lines = titleLines(card.title);')).toBe(true);
    expect(LADDER_CALL.test('const name = titleName(card.title);')).toBe(false);
  });

  it('reads a Title apart at a newline nowhere else', () => {
    const splitting = reaching(sources, NEWLINE_READ).filter(
      (file) => !isLadderReader(file) && !NOT_A_TITLE.includes(file),
    );

    expect(splitting).toEqual([]);
  });

  it('calls titleLines nowhere else', () => {
    const calling = reaching(sources, LADDER_CALL).filter((file) => !isLadderReader(file));

    expect(calling).toEqual([]);
  });

  /**
   * An exemption outlives its reason silently, and the scan then covers less
   * than it reads as covering.
   */
  it('keeps the not-a-Title exemption earning itself', () => {
    for (const file of NOT_A_TITLE) {
      expect(sources, `${file} is exempted but is not scanned`).toContain(file);
      expect(
        NEWLINE_READ.test(readFileSync(join(repoRoot, file), 'utf8')),
        `${file} no longer needs its exemption`,
      ).toBe(true);
    }
  });

  /**
   * A permission outlives its reason the way an exemption does. Holding each
   * one to a file is what makes that checkable: a tree goes on being permitted
   * on the strength of a reader that has left it.
   */
  it('keeps every ladder-reader permission earning itself', () => {
    const reads = (file: string): boolean => {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      return NEWLINE_READ.test(source) || LADDER_CALL.test(source);
    };

    for (const file of LADDER_READERS) {
      expect(sources, `${file} is permitted but is not scanned`).toContain(file);
      expect(reads(file), `${file} no longer reads a Title’s lines`).toBe(true);
    }
  });

  /**
   * And the Card front is still the thing being permitted. A permission granted
   * to a file that stopped drawing the ladder is a hole with a name on it.
   */
  it('keeps the Card front drawing the ladder', () => {
    expect(
      LADDER_CALL.test(readFileSync(join(repoRoot, 'packages/ui/src/CanvasCard.tsx'), 'utf8')),
    ).toBe(true);
  });
});
