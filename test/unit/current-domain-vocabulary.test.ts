import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ADR 0041 makes Graph the first-public name for the entity that was Route, and
 * states its own completion criterion as a repository scan: the retired names
 * survive only in historical records and in qualified HTTP or graph-layout
 * prose. Nothing was reading for that. `tsc` catches a reference to a name
 * nothing declares, but not a name reintroduced together with its declaration,
 * and it never opens a Markdown document, a `space.json` fixture or a card file
 * — which is most of what the rename touched.
 *
 * This reads the tracked files themselves, in the idiom
 * `conflict-markers.test.ts` already established here for the same shape of
 * problem: one scan over everything, rather than a hand-kept list of the places
 * someone remembered to look.
 */

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The retired words, built by joining fragments and never named by a constant
 * that is itself one of the shapes below, so this file holds none of them
 * literally and the scan can read it like every other tracked file. Excluding
 * this path instead would leave the one file that talks about the retired
 * vocabulary as the one file it could hide in.
 */
const ENTITY = ['R', 'oute'].join('');
const TRAVERSAL = ['W', 'alk'].join('');

const lower = ENTITY.toLowerCase();
const upper = ENTITY.toUpperCase();

/**
 * The retired vocabulary in **identifier shape**, which is what makes one
 * pattern safe to run over prose as well as code.
 *
 * The bare English words are unavoidable and legitimate: Hono routes requests,
 * ELK routes an edge around a card, TanStack Router owns a URL route, and the
 * ADRs and CONTEXT.md have to name what was retired in order to retire it. A
 * word-level ban on those would be enforced by an ever-growing list of
 * exceptions. A compound is different — nothing writes one of these by
 * accident, and the entity cannot come back without one, because it needs an
 * id, an edge and a field to live in.
 *
 * The `Routed*` geometry AGENTS.md carves out falls out of the shape rather
 * than needing an exception: the retired name followed by a *lowercase* letter
 * is a different word, so that component and ELK's routed sections never match.
 */
const RETIRED_COMPOUND = new RegExp(
  [
    // PascalCase compounds opening with it: its id, its edge, its HUD.
    `${ENTITY}[A-Z]`,
    // Compounds ending in it: the active one, the getter, the factory.
    `[A-Za-z]${ENTITY}\\b`,
    // camelCase compounds opening with it: its card ids, its id.
    `\\b${lower}[A-Z]`,
    // The screaming-case constants — the bare word, its plural, its palette.
    `\\b${upper}S?\\b`,
    `\\b${upper}_[A-Z]`,
    // The retired collection field, in a document or an object literal.
    `\\b${lower}s["']?\\s*[:=]`,
    // ...and read back off a value.
    `\\.${lower}s\\b`,
    // The same three shapes for the traversal name Traversal replaced.
    `${TRAVERSAL}[A-Z]`,
    `[A-Za-z]${TRAVERSAL}\\b`,
    `\\b${TRAVERSAL.toLowerCase()}[A-Z]`,
  ].join('|'),
);

/**
 * A bare retired name is the retired *type* itself. It can only be read that
 * way inside implementation source, where every name is ours — a spec file may
 * import Playwright's own same-named type, and a document has to be able to say
 * what the old name was. So the strict read is scoped to a tree rather than
 * bought with per-file exceptions.
 */
const RETIRED_BARE = new RegExp(`\\b(?:${ENTITY}|${TRAVERSAL})\\b`);

/**
 * The retired name's *initial*, bound over a Graph collection. A single-letter
 * callback binding is below what the two patterns above can read — they need a
 * compound or a whole word — so `space.graphs.map((r) => r.id)` survived the
 * rename in three places with the guard green, and the last of them sat twelve
 * lines from the first.
 *
 * A bare ban on the letter is what makes this look unaffordable: `r` is
 * legitimately a result, a row, a request or a repository, and the deny-list
 * that follows would never stop growing. Requiring the Graph collection on the
 * same line is what removes that cost entirely — the repo's convention is the
 * domain initial (`(c)` for card, `(l)` for layout, `(e)` for edge), so a
 * binding introduced over `graphs` has exactly one correct letter and the
 * retired name's is not it. This is the answer to the open question in
 * `.scratch/graph-rename/issues/03-...`: worth reading, once scoped this way.
 */
const RETIRED_INITIAL_BINDING = new RegExp(
  `\\.graphs\\b.*\\(\\s*${ENTITY[0]?.toLowerCase() ?? ''}\\s*\\)\\s*=>`,
);

const isImplementationSource = (file: string): boolean =>
  file.startsWith('src/') || /^packages\/[^/]+\/src\//.test(file);

/**
 * An accepted ADR is immutable and a resolved issue record is history — both
 * exist to say what the design used to be, so both have to keep saying it
 * (`docs/agents/workflow.md`). These are trees rather than paths: a record that
 * moves inside one stays covered, and there is nothing to re-list.
 */
const HISTORICAL_TREES = ['docs/adr/', 'docs/superpowers/', '.scratch/'] as const;

/**
 * The one live file speaking a *different* library's routing vocabulary.
 * TanStack Router's root/tree constructors are its API, not our domain, and
 * this file is the whole of our contact with it. It is named rather than
 * pattern-matched so that reintroducing the domain entity here still fails.
 */
const QUALIFIED_FILES = ['packages/app/src/router.tsx'] as const;

/** The index modes of an ordinary blob; a tracked symlink is `120000`. */
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

/**
 * The repository's tracked regular files. Git rather than a directory walk:
 * `node_modules` dwarfs everything worth reading, and an untracked working file
 * cannot reach a commit. `CLAUDE.md` is a tracked symlink to `AGENTS.md`, and
 * the mode filter is what keeps it from being read (and reported) twice.
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

/** Every line of `text` matching `pattern`, as `line: text` for a readable failure. */
const hits = (text: string, pattern: RegExp): string[] =>
  text
    .split('\n')
    .flatMap((line, index) => (pattern.test(line) ? [`${index + 1}: ${line.trim()}`] : []));

const readTracked = (file: string): string | null => {
  const absolute = join(repoRoot, file);
  // A tracked file deleted in the working tree is still an index entry, and
  // what it no longer contains cannot reach a commit.
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
};

describe('the retired domain vocabulary is gone from tracked files', () => {
  const scanned = trackedFiles().filter(
    (file) =>
      !HISTORICAL_TREES.some((tree) => file.startsWith(tree)) &&
      !QUALIFIED_FILES.includes(file as (typeof QUALIFIED_FILES)[number]),
  );

  it('reaches the kinds of file the rename actually touched', () => {
    // A file list that quietly stopped resolving would report nothing forever.
    // The rename crossed all four, and only one of them is a compiler's concern.
    expect(scanned).toContain('AGENTS.md');
    expect(scanned.filter((file) => file.endsWith('.ts')).length).toBeGreaterThan(0);
    expect(scanned.filter((file) => file.endsWith('.md')).length).toBeGreaterThan(0);
    expect(scanned.filter((file) => file.endsWith('.json')).length).toBeGreaterThan(0);
  });

  it('finds no compound of the retired names anywhere it still governs', () => {
    const found = scanned.flatMap((file) => {
      const source = readTracked(file);
      return source === null ? [] : hits(source, RETIRED_COMPOUND).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('finds no bare retired type name in implementation source', () => {
    const found = scanned.filter(isImplementationSource).flatMap((file) => {
      const source = readTracked(file);
      return source === null ? [] : hits(source, RETIRED_BARE).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('finds no retired initial bound over a Graph collection', () => {
    const found = scanned.filter(isImplementationSource).flatMap((file) => {
      const source = readTracked(file);
      return source === null
        ? []
        : hits(source, RETIRED_INITIAL_BINDING).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('keeps no exemption that has stopped earning itself', () => {
    // An exemption outlives its reason silently, and the scan then covers less
    // than it reads as covering. Each one has to still be doing something.
    for (const file of QUALIFIED_FILES) {
      const source = readTracked(file);
      expect(source, `${file} is exempted but no longer tracked`).not.toBeNull();
      expect(
        hits(source ?? '', RETIRED_COMPOUND),
        `${file} no longer needs its exemption`,
      ).not.toEqual([]);
    }
  });
});

/**
 * The guard above is only as sharp as the pattern under it, and a pattern that
 * silently stopped matching would pass every file forever. Read it against the
 * names ADR 0041 retired, and against the ones it deliberately leaves alone.
 */
describe('the vocabulary that guard reads', () => {
  it('reports the retired names in every shape they were written in', () => {
    const retired = [
      `export type ${ENTITY}Id = string;`,
      `import type { ${ENTITY}Edge } from '@project/core';`,
      `const active${ENTITY} = layout.active${ENTITY};`,
      `export const get${ENTITY} = (space: Space) => space.${lower}s[0];`,
      `const ${lower}CardIds = new Set();`,
      `const ${upper}_PALETTE = ['#000'];`,
      `{ "${lower}s": [] }`,
      `const ${TRAVERSAL}History = [];`,
    ];

    for (const line of retired) {
      expect(RETIRED_COMPOUND.test(line), line).toBe(true);
    }
    expect(RETIRED_BARE.test(`export type ${ENTITY} = { id: string };`)).toBe(true);
    expect(RETIRED_BARE.test(`export interface ${TRAVERSAL} { cards: string[] }`)).toBe(true);
  });

  it('reports the retired initial only where a Graph collection introduces it', () => {
    const initial = ENTITY[0]?.toLowerCase() ?? '';
    const bound = [
      `for (const id of duplicates(space.graphs.map((${initial}) => ${initial}.id))) {`,
      `const graphIds = new Set(space.graphs.map((${initial}) => ${initial}.id));`,
      `graphsById: new Map(input.graphs.map((${initial}) => [${initial}.id, ${initial}])),`,
    ];

    for (const line of bound) {
      expect(RETIRED_INITIAL_BINDING.test(line), line).toBe(true);
    }
  });

  it('stays silent on the letter in every sense that is not a Graph', () => {
    const initial = ENTITY[0]?.toLowerCase() ?? '';
    const kept = [
      // The domain initial that is correct over a Graph collection.
      `const graphIds = new Set(space.graphs.map((g) => g.id));`,
      `space.graphs.map((graph) => graph.id)`,
      // The letter, legitimately, over anything that is not a Graph.
      `const rows = result.rows.map((${initial}) => ${initial}.id);`,
      `responses.map((${initial}) => ${initial}.status)`,
      `repositories.forEach((${initial}) => ${initial}.close());`,
      // The collection without a binding, and a binding without the collection.
      `const all = space.graphs.map((graph) => graph.id);`,
      `const ids = cards.map((${initial}) => ${initial}.id);`,
    ];

    for (const line of kept) {
      expect(RETIRED_INITIAL_BINDING.test(line), line).toBe(false);
    }
  });

  it('stays silent on the qualified senses the ADR keeps', () => {
    const kept = [
      // ELK's routed geometry and its component (AGENTS.md).
      `import { ${ENTITY}dEdge } from './${ENTITY}dEdge';`,
      `// a single layout pass ${lower}s them around the cards`,
      // Hono and the HTTP application.
      `// the portable ${lower} module quietly depends on`,
      // The historical scratch path, and ordinary English.
      `\`.scratch/multi-${lower}/\` retains its historical path`,
      `Named ${TRAVERSAL.toLowerCase()}throughs, each an id and a title`,
    ];

    for (const line of kept) {
      expect(RETIRED_COMPOUND.test(line), line).toBe(false);
    }
  });
});
