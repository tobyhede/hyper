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
 * The Card front draws the ladder and is the only surface that does (ADR 0083),
 * and the render adapter is what mounts that front on the canvas — so the pair
 * is the region, not the file. `@project/core`'s own module is where the rule
 * lives and is what every other reader goes through.
 */
const LADDER_READERS: readonly string[] = [
  'packages/core/src/title.ts',
  'packages/ui/src/CanvasCard.tsx',
];

/** The render adapter, whole: it owns the surface the front is drawn on. */
const LADDER_READER_TREES: readonly string[] = ['packages/react-flow-adapter/src/'];

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
 * A split on a line break, however the break is written.
 *
 * Escaped once for the regex and once for the TypeScript string it is read out
 * of, which is why the `\\n` here means the two characters a source file holds.
 */
const NEWLINE_SPLIT = /\.split\(\s*(?:'\\n'|"\\n"|`\\n`|\/\\r\?\\n\/|\/\\n\/)/u;

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

const insideLadderReaders = (file: string): boolean =>
  LADDER_READERS.includes(file) || LADDER_READER_TREES.some((tree) => file.startsWith(tree));

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
    expect(NEWLINE_SPLIT.test(String.raw`const lines = title.split('\n');`)).toBe(true);
    expect(NEWLINE_SPLIT.test(String.raw`title.split("\n").map(read)`)).toBe(true);
    expect(NEWLINE_SPLIT.test(String.raw`title.split(/\r?\n/)`)).toBe(true);
    expect(NEWLINE_SPLIT.test(String.raw`title.split(', ')`)).toBe(false);
    expect(LADDER_CALL.test('const lines = titleLines(card.title);')).toBe(true);
    expect(LADDER_CALL.test('const name = titleName(card.title);')).toBe(false);
  });

  it('splits a Title on a newline nowhere else', () => {
    const splitting = reaching(sources, NEWLINE_SPLIT).filter(
      (file) => !insideLadderReaders(file) && !NOT_A_TITLE.includes(file),
    );

    expect(splitting).toEqual([]);
  });

  it('calls titleLines nowhere else', () => {
    const calling = reaching(sources, LADDER_CALL).filter((file) => !insideLadderReaders(file));

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
        NEWLINE_SPLIT.test(readFileSync(join(repoRoot, file), 'utf8')),
        `${file} no longer needs its exemption`,
      ).toBe(true);
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
