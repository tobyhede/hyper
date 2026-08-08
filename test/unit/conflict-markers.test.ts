import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A resolved conflict that keeps one of its markers is a syntax error in code
 * and a silent corruption in prose, and nothing in `pnpm verify` was reading for
 * one: `.prettierignore` excludes every Markdown file, so `format:check` never
 * opens one at all, and `.scratch/` is ignored by ESLint as well. That is how a
 * labelled opener reached a tracked issue record and survived a green verify.
 *
 * `git diff --check` does report a marker, but only on a line inside a diff
 * hunk. Once the marker is committed it is context rather than change, so the
 * check is silent about it from the next commit onward; it is a guard against
 * introducing one in the run that introduces it, not against carrying one.
 * This reads the files themselves, which is the only thing that stays true
 * afterwards.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The three marker strings, built by repetition rather than written out, so this
 * file holds no marker of its own. That is what lets the scan read it like every
 * other tracked file once it is committed: excluding this path instead would
 * leave the one file that talks about conflict markers as the one file a real
 * conflict could hide in.
 */
const OPENER = '<'.repeat(7);
const DIVIDER = '='.repeat(7);
const CLOSER = '>'.repeat(7);

/**
 * Git's own marker shape. The opener and closer carry the branch or commit that
 * produced them (`… HEAD`), so **neither is anchored at the end** — an
 * end-anchored seven-character pattern matches no real conflict marker at all,
 * which is the specific mistake this replaces. The divider is written bare and
 * is matched bare, which also keeps a seven-character Setext heading underline
 * from reading as a conflict.
 *
 * Exactly seven characters, then end of line or whitespace: an eighth is not a
 * marker.
 */
const MARKER = new RegExp(`^(?:(?:${OPENER}|${CLOSER})(?:\\s.*)?|${DIVIDER})$`);

/** Every line of `text` that is a conflict marker, as 1-based line numbers. */
const markerLines = (text: string): number[] =>
  text
    .split('\n')
    .flatMap((line, index) => (MARKER.test(line.replace(/\r$/, '')) ? [index + 1] : []));

/** The index modes of an ordinary blob. A tracked symlink is `120000` and a
 *  submodule `160000`; neither is a file to read. */
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

/**
 * The repository's tracked regular files, as repo-relative paths. Git rather
 * than a directory traversal: `node_modules` alone is larger than everything worth
 * reading, and an untracked working file cannot reach a commit.
 *
 * The mode is read rather than assumed because `.claude/skills/*` are tracked
 * symlinks to *directories*, and following one is an `EISDIR` rather than a
 * finding. A symlink's own content is the path it points at, which is never a
 * marker, and a target that is itself tracked is read under its own entry.
 */
const trackedFiles = (): readonly string[] =>
  execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .flatMap((entry) => {
      // `<mode> <object> <stage>\t<path>`, and a path may itself contain a tab.
      const separator = entry.indexOf('\t');
      if (separator === -1) return [];
      return REGULAR_FILE_MODES.has(entry.slice(0, 6)) ? [entry.slice(separator + 1)] : [];
    });

describe('tracked files carry no conflict markers', () => {
  it('finds none in any tracked file', () => {
    const files = trackedFiles();

    // A file list that quietly stopped resolving would report nothing forever,
    // which is the failure mode of deriving it rather than writing it down. It
    // has to reach both kinds that matter: Markdown, which `format:check` never
    // reads and where the marker that prompted this sat, and TypeScript, where a
    // marker is a compile error but only in a file a compiler is pointed at.
    expect(files).toContain('package.json');
    expect(files.filter((file) => file.endsWith('.md')).length).toBeGreaterThan(0);
    expect(files.filter((file) => file.endsWith('.ts')).length).toBeGreaterThan(0);

    const found = files.flatMap((file) => {
      const absolute = join(repoRoot, file);
      // A tracked file deleted in the working tree is still an index entry, and
      // what it no longer contains cannot reach a commit.
      if (!existsSync(absolute)) return [];
      return markerLines(readFileSync(absolute, 'utf8')).map((line) => `${file}:${line}`);
    });

    expect(found).toEqual([]);
  });
});

/**
 * The guard above is only as sharp as the pattern under it, and a pattern that
 * silently stopped matching would pass the scan on every file forever. Read it
 * against the conflict git actually writes, and against the lines that only look
 * like one.
 */
describe('the marker shape that guard reads', () => {
  it('reports every marker a conflict leaves behind, labelled or bare', () => {
    const conflicted = [
      'before',
      `${OPENER} HEAD`,
      'ours',
      DIVIDER,
      'theirs',
      `${CLOSER} feature/branch`,
      'after',
    ].join('\n');

    expect(markerLines(conflicted)).toEqual([2, 4, 6]);
    // The opener a rebase writes carries a commit subject; a merge's carries a
    // ref. Both are labels, and a bare opener is legal too.
    expect(markerLines([OPENER, `${OPENER} 6a72fdb (Remove redundant parses)`].join('\n'))).toEqual(
      [1, 2],
    );
  });

  it('stays silent on the lines that only look like one', () => {
    const nearMisses = [
      '<'.repeat(6),
      '<'.repeat(8),
      '='.repeat(6),
      '='.repeat(8),
      '>'.repeat(6),
      `  ${OPENER} HEAD`,
      `x ${DIVIDER}`,
      `${DIVIDER} labelled`,
    ].join('\n');

    expect(markerLines(nearMisses)).toEqual([]);
  });
});
