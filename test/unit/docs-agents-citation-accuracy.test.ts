import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `AGENTS.md`'s split into `docs/agents/*.md` (see that commit) repointed 13
 * in-code comments that used to cite `AGENTS.md` by name, and the split's own
 * claim was that each now names "the file that now carries the fact". `tsc`
 * and ESLint both read a comment as inert text, so nothing already checks that
 * the fact actually landed where the comment says it did — and one didn't:
 * `space-snapshot.test.ts` cited `editing-and-persistence.md` for a bullet
 * that lives in `http.md`.
 *
 * Most of the 13 citations are bare file mentions with nothing to check
 * against. One shape is checkable: a comment that quotes the cited bullet's
 * own lead-in verbatim (`` `docs/agents/X.md` pins under "..." ``). This reads
 * every such citation in the tree, in the idiom `conflict-markers.test.ts`
 * established here, and asserts the quoted fragment is actually present in
 * the file it is attributed to.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** The index modes of an ordinary blob; a tracked symlink is `120000`. */
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

/** The repository's tracked regular files, the way `current-domain-vocabulary.test.ts` reads them. */
const trackedFiles = (): readonly string[] =>
  execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .flatMap((entry) => {
      const separator = entry.indexOf('\t');
      if (separator === -1) return [];
      return REGULAR_FILE_MODES.has(entry.slice(0, 6)) ? [entry.slice(separator + 1)] : [];
    });

const readTracked = (file: string): string | null => {
  const absolute = join(repoRoot, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
};

/**
 * `` `docs/agents/<file>.md` pins under "<fragment>" ``, tolerant of the
 * comment wrapping across lines: a JSDoc block breaks "pins" and "under" onto
 * separate lines, each continuation reopening with `\s*\*\s*`, so the gap
 * between the two words is whitespace and asterisks, never prose. The
 * fragment itself may be quoted with `"` or `'`, matched by backreference so
 * a citation cannot open with one and close with the other.
 */
const CITATION = /`docs\/agents\/([a-z][a-z-]*\.md)`\s*pins[\s*]+under[\s*]+(["'])([^"']+)\2/g;

interface Citation {
  readonly file: string;
  readonly citedDoc: string;
  readonly fragment: string;
}

const citationsIn = (file: string, text: string): readonly Citation[] =>
  [...text.matchAll(CITATION)].map((match) => ({
    file,
    citedDoc: `docs/agents/${match[1]}`,
    fragment: match[3] ?? '',
  }));

const findCitations = (files: readonly string[]): readonly Citation[] =>
  files.flatMap((file) => {
    const source = readTracked(file);
    return source === null ? [] : citationsIn(file, source);
  });

/** Every citation whose quoted fragment cannot be found in the file it names. */
const citationFaults = (citations: readonly Citation[]): string[] =>
  citations.flatMap(({ file, citedDoc, fragment }) => {
    const cited = readTracked(citedDoc);
    if (cited === null) return [`${file} cites ${citedDoc}, which is not a tracked file`];
    return cited.includes(fragment)
      ? []
      : [`${file} cites ${citedDoc} under "${fragment}", which ${citedDoc} does not contain`];
  });

describe('a docs/agents citation names the file that actually carries the fact', () => {
  const scanned = trackedFiles();
  const citations = findCitations(scanned);

  it('finds at least one citation in this quoted shape', () => {
    // A pattern that quietly stopped matching would pass every citation
    // forever, the same failure mode `current-domain-vocabulary.test.ts` and
    // `adr-status-blocks.test.ts` guard against for their own scans.
    expect(citations.length).toBeGreaterThan(0);
  });

  it('never cites a fragment absent from the file it names', () => {
    expect(citationFaults(citations)).toEqual([]);
  });
});

/**
 * The guard above is only as sharp as the pattern under it. Read it against
 * the real citation's exact wrapping, and against text that only looks like
 * one.
 */
describe('the citation pattern that guard reads', () => {
  it('matches the real citation, wrapped across a JSDoc comment the way this file is', () => {
    const text = [
      '  /**',
      '   * sentence — and reaches it with these instead, which is what `docs/agents/editing-and-persistence.md` pins',
      '   * under "A wire codec throws prose, not Zod".',
      '   */',
    ].join('\n');

    const found = citationsIn('example.ts', text);
    expect(found).toEqual([
      {
        file: 'example.ts',
        citedDoc: 'docs/agents/editing-and-persistence.md',
        fragment: 'A wire codec throws prose, not Zod',
      },
    ]);
  });

  it('matches a citation written on one line', () => {
    const found = citationsIn(
      'example.ts',
      'which is what `docs/agents/ui.md` pins under "Base UI and Lucide are the UI foundation"',
    );

    expect(found).toEqual([
      {
        file: 'example.ts',
        citedDoc: 'docs/agents/ui.md',
        fragment: 'Base UI and Lucide are the UI foundation',
      },
    ]);
  });

  it('accepts a single-quoted fragment', () => {
    const found = citationsIn(
      'example.ts',
      "which is what `docs/agents/http.md` pins under 'A wire codec throws prose, not Zod'",
    );

    expect(found[0]?.fragment).toBe('A wire codec throws prose, not Zod');
  });

  it('stays silent on a bare file mention with nothing quoted', () => {
    // Twelve of the thirteen repointed comments look like this — a bare
    // parenthetical or "X's install-gate rule" with no quoted fragment to
    // check against. There is nothing here for this guard to verify.
    const bare = [
      '// This is the one deferred read of the fallback-band exception (docs/agents/rendering.md).',
      '// docs/agents/rendering.md says `gridStrategy` is pure.',
    ].join('\n');

    expect(citationsIn('example.ts', bare)).toEqual([]);
  });

  it('reports a fragment the cited file does not contain', () => {
    const citations = citationsIn(
      'example.ts',
      'which is what `docs/agents/editing-and-persistence.md` pins under "A wire codec throws prose, not Zod"',
    );

    const fault = citationFaults(citations);
    expect(fault).toEqual([
      'example.ts cites docs/agents/editing-and-persistence.md under "A wire codec throws prose, not Zod", which docs/agents/editing-and-persistence.md does not contain',
    ]);
  });

  it('passes a fragment the cited file does contain', () => {
    const citations = citationsIn(
      'example.ts',
      'which is what `docs/agents/http.md` pins under "A wire codec throws prose, not Zod"',
    );

    expect(citationFaults(citations)).toEqual([]);
  });

  it('reports a citation naming a file that is not tracked at all', () => {
    const citations = citationsIn(
      'example.ts',
      'which is what `docs/agents/nonexistent.md` pins under "anything"',
    );

    expect(citationFaults(citations)).toEqual([
      'example.ts cites docs/agents/nonexistent.md, which is not a tracked file',
    ]);
  });
});
