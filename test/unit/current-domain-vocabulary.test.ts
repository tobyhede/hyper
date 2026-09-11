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
 * and it never opens a Markdown document, a `space.json` fixture or a thing file
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
// Separated by a space *or a hyphen*: the retired terms were also written as
// compound adjectives, and a guard that knew only the spaced form left the
// hyphenated one as the spelling the sweep could hide in — which is exactly
// where one survived, in a parity claim, until this line widened.
const RETIRED_CANVAS_TERMS = new RegExp(
  `${['Computed', 'View'].join('[ -]')}|${['Algorithmic', 'View'].join('[ -]')}|${['Space', 'View'].join('[ -]')}`,
  'i',
);
const RETIRED_OPENING_FIELD = ['default', 'Renderer'].join('');

const lower = ENTITY.toLowerCase();
const upper = ENTITY.toUpperCase();

/**
 * The retired vocabulary in **identifier shape**, which is what makes one
 * pattern safe to run over prose as well as code.
 *
 * The bare English words are unavoidable and legitimate: Hono routes requests,
 * ELK routes an edge around a thing, TanStack Router owns a URL route, and the
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
    // camelCase compounds opening with it: its thing ids, its id.
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
 * domain initial (`(t)` for thing, `(d)` for diagram, `(e)` for edge), so a
 * binding introduced over `graphs` has exactly one correct letter and the
 * retired name's is not it. This is the answer to the open question in
 * `.scratch/graph-rename/issues/03-...`: worth reading, once scoped this way.
 *
 * The collection has to be the **receiver of the callback**, with nothing
 * between them. An earlier draft allowed any gap, and matched a correct
 * `space.graphs.map((graph) => …)` followed on the same line by
 * `rows.map((r) => …)`, where the letter is bound by something this guard does
 * not govern. It also read one line at a time and required parentheses, so the
 * two forms Prettier actually produces — an unparenthesized single parameter,
 * and a callback broken across lines — were both invisible.
 */
const RETIRED_INITIAL_BINDING = new RegExp(
  [
    // The Graph collection, then the iteration method it is the receiver of.
    `\\.graphs\\s*\\.\\s*[A-Za-z]+\\s*\\(`,
    // The callback's first parameter: parenthesized, optionally annotated, or
    // bare. `\\b` is what keeps `result`, `rows` and `repositories` out.
    `\\s*(?:\\(\\s*${ENTITY[0]?.toLowerCase() ?? ''}\\s*(?::[^)]*)?\\)|${ENTITY[0]?.toLowerCase() ?? ''}\\b)\\s*=>`,
  ].join(''),
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
 * Live files speaking a different library's routing vocabulary belong here.
 * The list is empty now that no routing library owns product navigation.
 */
const QUALIFIED_FILES = [] as const;

/**
 * The one file where the retired name is a **foreign** identifier rather than a
 * domain one.
 *
 * `packages/ui/src/icons.tsx` is the Lucide facade, and Lucide's glyph for a
 * path between two pins is exported under the retired entity name. The icon is
 * what a Graph is drawn as (`GraphIcon`) — the name arrives with the library
 * and names a shape rather than a domain type, so ADR 0041 has nothing to say
 * about it, and the bare scan cannot tell the two apart because they are
 * spelled identically.
 *
 * This is the same carve-out the block below already makes for React Flow's own
 * edge-label component and CSS class: a name that is not ours to sweep. It is a
 * **file** exemption rather than a shape one precisely because there is no shape
 * to read.
 *
 * Kept honest two ways. It is scoped to the facade, which is the only module in
 * the package allowed to import Lucide at all, so the foreign name cannot spread
 * behind it; and it is asserted below to still be earning itself, so deleting
 * the import deletes the exemption rather than leaving a hole.
 *
 * **The compound arm still governs this file.** Only the bare word is forgiven:
 * the retired name carrying an id, an edge or an `active` prefix is the domain
 * name wherever it is written, and is still reported here.
 */
const FOREIGN_BARE_FILES: readonly string[] = ['packages/ui/src/icons.tsx'];

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

/**
 * Every tracked file the historical trees do not account for — what all three
 * blocks below start from, and the reason none of them writes the exclusion out
 * again. The one that narrows further does so on top of this.
 */
const scannableFiles = (): readonly string[] =>
  trackedFiles().filter((file) => !HISTORICAL_TREES.some((tree) => file.startsWith(tree)));

/** Every line of `text` matching `pattern`, as `line: text` for a readable failure. */
const hits = (text: string, pattern: RegExp): string[] =>
  text
    .split('\n')
    .flatMap((line, index) => (pattern.test(line) ? [`${index + 1}: ${line.trim()}`] : []));

/**
 * Every match of `pattern` anywhere in `text`, as `line: text`. Separate from
 * `hits` because a callback may be broken across lines and a line-by-line read
 * cannot see one. The pattern is recompiled global here rather than declared
 * that way, so `lastIndex` never carries between calls or into a `.test()`.
 */
const spanningHits = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(new RegExp(pattern.source, 'g'))].map((match) => {
    const line = text.slice(0, match.index).split('\n').length;
    return `${line}: ${match[0].replace(/\s+/g, ' ')}`;
  });

const readTracked = (file: string): string | null => {
  const absolute = join(repoRoot, file);
  // A tracked file deleted in the working tree is still an index entry, and
  // what it no longer contains cannot reach a commit.
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
};

/**
 * An exemption outlives its reason silently, and the scan then covers less than
 * it reads as covering. Each one has to still be doing something, so each is
 * read against the pattern it was granted against.
 */
const expectEachExemptionEarned = (files: readonly string[], pattern: RegExp): void => {
  for (const file of files) {
    const source = readTracked(file);
    expect(source, `${file} is exempted but no longer tracked`).not.toBeNull();
    expect(hits(source ?? '', pattern), `${file} no longer needs its exemption`).not.toEqual([]);
  }
};

describe('the retired domain vocabulary is gone from tracked files', () => {
  // SAFETY: `includes` only needs to compare `file` against the literal
  // members of `QUALIFIED_FILES` at runtime — the cast doesn't claim `file`
  // is one of them, it just lets a plain `string` be checked against a
  // narrower tuple's `includes` signature.
  const scanned = scannableFiles().filter(
    (file) => !QUALIFIED_FILES.includes(file as (typeof QUALIFIED_FILES)[number]),
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
    const found = scanned
      .filter(isImplementationSource)
      .filter((file) => !FOREIGN_BARE_FILES.includes(file))
      .flatMap((file) => {
        const source = readTracked(file);
        return source === null ? [] : hits(source, RETIRED_BARE).map((hit) => `${file}:${hit}`);
      });

    expect(found).toEqual([]);
  });

  it('still reports the compound sense inside the foreign-name exemption', () => {
    // The exemption forgives the bare word and nothing else, so the file stays
    // in the compound scan above. Composed rather than written out, in this
    // file's usual idiom: spelled literally, the fixture would be a hit this
    // scan reports against its own source.
    for (const file of FOREIGN_BARE_FILES) {
      expect(scanned).toContain(file);
      expect(readTracked(file), `${file} is exempted but no longer tracked`).not.toBeNull();
    }
    expect(hits(`const active${ENTITY} = diagram.active${ENTITY};`, RETIRED_COMPOUND)).not.toEqual(
      [],
    );
  });

  it('finds no retired initial bound over a Graph collection', () => {
    const found = scanned.filter(isImplementationSource).flatMap((file) => {
      const source = readTracked(file);
      return source === null
        ? []
        : spanningHits(source, RETIRED_INITIAL_BINDING).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('keeps no exemption that has stopped earning itself', () => {
    expectEachExemptionEarned(QUALIFIED_FILES, RETIRED_COMPOUND);
    // Read against the pattern it was granted against: the day the facade stops
    // importing the foreign glyph, the exemption stops being earned and goes.
    expectEachExemptionEarned(FOREIGN_BARE_FILES, RETIRED_BARE);
  });

  it('finds no retired canvas vocabulary in live files', () => {
    const found = scannableFiles().flatMap((file) => {
      const source = readTracked(file);
      return source === null
        ? []
        : hits(source, RETIRED_CANVAS_TERMS).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('finds no retired opening field in live files', () => {
    const found = scannableFiles().flatMap((file) => {
      const source = readTracked(file);
      return source?.includes(RETIRED_OPENING_FIELD) === true ? [file] : [];
    });

    expect(found).toEqual([]);
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
      `const active${ENTITY} = diagram.active${ENTITY};`,
      `export const get${ENTITY} = (space: Space) => space.${lower}s[0];`,
      `const ${lower}ThingIds = new Set();`,
      `const ${upper}_PALETTE = ['#000'];`,
      `{ "${lower}s": [] }`,
      `const ${TRAVERSAL}History = [];`,
    ];

    for (const line of retired) {
      expect(RETIRED_COMPOUND.test(line), line).toBe(true);
    }
    expect(RETIRED_BARE.test(`export type ${ENTITY} = { id: string };`)).toBe(true);
    expect(RETIRED_BARE.test(`export interface ${TRAVERSAL} { things: string[] }`)).toBe(true);
  });

  it('reports the retired initial only where a Graph collection introduces it', () => {
    const initial = ENTITY[0]?.toLowerCase() ?? '';
    const bound = [
      `for (const id of duplicates(space.graphs.map((${initial}) => ${initial}.id))) {`,
      `const graphIds = new Set(space.graphs.map((${initial}) => ${initial}.id));`,
      `const byId = new Map(input.graphs.map((${initial}) => [${initial}.id, ${initial}]));`,
      // A single parameter needs no parentheses, and Prettier removes them at
      // the repo's width often enough that this is the form a new one arrives in.
      `const ids = space.graphs.map(${initial} => ${initial}.id);`,
      // Broken across lines, which is what Prettier does once the line is long.
      `const ids = space.graphs.map(\n      (${initial}) => ${initial}.id,\n    );`,
      // Annotated, which the inferred call sites do not write but a new one might.
      `space.graphs.map((${initial}: Graph) => ${initial}.id)`,
      // Any iteration method, not just `map`.
      `diagram.graphs.some((${initial}) => ${initial}.id === graphId)`,
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
      `const ids = things.map((${initial}) => ${initial}.id);`,
      // The one the unconstrained form got wrong: a correct Graph callback, then
      // a later callback over a *derived* collection on the same line. The
      // letter there is bound by `rows`, not by anything this guard governs.
      `const ids = space.graphs.map((graph) => graph.id).concat(rows.map((${initial}) => ${initial}.id));`,
      // `.graphs` reached, but not as the receiver of the callback.
      `if (diagram.graphs.includes(graphId)) return rows.map((${initial}) => ${initial}.id);`,
    ];

    for (const line of kept) {
      expect(RETIRED_INITIAL_BINDING.test(line), line).toBe(false);
    }
  });

  it('stays silent on the qualified senses the ADR keeps', () => {
    const kept = [
      // ELK's routed geometry and its component (AGENTS.md).
      `import { ${ENTITY}dEdge } from './${ENTITY}dEdge';`,
      `// a single layout pass ${lower}s them around the things`,
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

/**
 * ADR 0055's rename is the same event as ADR 0041's and earns the same guard.
 * Three names each called what draws the canvas after a different interaction
 * or surface — the act of selecting one, the control that offered the choice,
 * and the header that showed which one won — so every new presentation invited
 * a fourth.
 *
 * ADR 0079 then settled the noun itself: an authored **Diagram** is the only
 * entity that draws the canvas, and the render-layer word that stood between a
 * Diagram id and the Diagram it names went with the module it named. Its identity
 * is `DiagramId` in `@project/core` now, resolution is `resolveDiagram`, and the
 * Sidebar takes the Space's Diagrams rather than a row type derived for it.
 * Every spelling that indirection was written in is retired below, so it cannot
 * grow back under a name a reader would have to follow to recognise.
 *
 * The persisted key that moved with them is deliberately **not** read here.
 * ADR 0054 rolls the unreleased prototype forward, and issue `04` foreclosed
 * every back-compat path for that key by name — so there is no live source this
 * scan would be protecting, and a document outside this repository still
 * carrying it is not a thing a scan over tracked files can reach anyway.
 *
 * The names below have no qualified sense anywhere, unlike ADR 0041's, so this
 * scan carries no exemption list beyond the historical trees. What it caught on
 * the rename that added it was `docs/agents/ui.md` — the read-before-touching
 * authority for the sidebar, still pointing the next agent at a deleted module
 * and a renamed prop. `docs-agents-citation-accuracy.test.ts` reads code→doc
 * quotations and has nothing to say about a document naming code that is gone.
 *
 * **The bare render-layer word is not read, and cannot be.** React Flow ships
 * `EdgeLabelRenderer` and a `react-flow__renderer` class, `SpaceAppRenderer`
 * genuinely renders a React element, and a Markdown renderer is a renderer.
 * What is read is each spelling the retired indirection was actually written
 * in — the same shape rule ADR 0041 uses, for the same reason.
 */
const RETIRED_RENDERER_NAMES = [
  // The type, and the key function that was built on its name.
  ['Renderer', 'Selection'],
  ['renderer', 'Selection'],
  // The aggregate, its camelCase builder, and the module both lived in.
  ['Canvas', 'Choice'],
  ['canvas', 'Choice'],
  ['canvas', '-choice'],
  // The reference error whose kind named a field the format no longer has.
  ['unresolved-default', '-view'],
  // ADR 0079: the aggregate the resolver answered, and the subject inside it.
  ['Resolved', 'Renderer'],
  ['Renderer', 'Subject'],
  ['Renderer', 'Invariant'],
  // The resolver, its factory and its injected function type.
  ['resolve', 'Renderer'],
  ['Resolve', 'Renderer'],
  ['createRenderer', 'Resolver'],
  // The row type the Sidebar took, its collection, its module and its builder.
  ['Canvas', 'Renderer'],
  ['canvas', 'Renderers'],
  ['canvas', '-renderers'],
  ['canvasRenderer', 'Key'],
  ['current', 'Renderer'],
  // Navigation's field and the two operations that moved between Diagrams.
  ['selected', 'Renderer'],
  ['select', 'Renderer'],
  ['continueIn', 'Renderer'],
  // The DOM hooks the Diagram row carried.
  ['data-', 'renderer'],
  ['canvas', '-renderer'],
].map((parts) => parts.join(''));

/**
 * The header component's name, retired twice over.
 *
 * It was read as a **whole identifier** while the longer name that extended it
 * was current: the component kept this prefix and gained the render-layer noun,
 * so a prefix read would have reported its own replacement. ADR 0079 retired
 * that longer name too — the header takes a Diagram and is named for one — so
 * the whole-identifier rule goes with it and this is read as a prefix like
 * every other name above. That is what now makes one entry cover both.
 *
 * Joined here rather than written out, in this file's established idiom, and the
 * prose above says which names these are without spelling one: no retired name
 * appears literally, so the scan reads this file like every other tracked one
 * instead of excluding the file that talks about them.
 */
const RETIRED_SELECTED_CANVAS = ['Selected', 'Canvas', 'Renderer'].join('');

/**
 * The field the aggregate stopped carrying when the two questions were split.
 *
 * The list of rows and which one was current became two answers rather than one
 * value with a field, so a reader sent to this field is sent to one that does
 * not exist — which is what `docs/agents/ui.md` went on doing after the split,
 * in the same bullet the rename above had already been corrected in. Nothing
 * was reading for it: the retired *names* were gone, so every scan here was
 * green while the read-before-touching document still described a shape the
 * code had left. Both the list and the separate answer are themselves retired
 * now, and the entries above hold them.
 *
 * Named rather than listed above because it is the one entry the self-test has
 * to write out, and because the two spellings differ: the scan needs the dot
 * escaped, and the fixture text needs it plain. Unescaped it is a wildcard, and
 * the scan would also report an identifier with any character in between.
 */
const RETIRED_AGGREGATE_FIELD = ['renderers', '.selected'].join('');

const RETIRED_RENDERER_NAME = new RegExp(
  [
    ...RETIRED_RENDERER_NAMES.map((name) => `\\b${name}`),
    `\\b${RETIRED_SELECTED_CANVAS}`,
    `\\b${RETIRED_AGGREGATE_FIELD.replace('.', '\\.')}`,
  ].join('|'),
);

describe('the canvas renderer is named once (ADR 0055)', () => {
  const scanned = scannableFiles();

  it('reaches the kinds of file this rename actually touched', () => {
    // The two files the rename left something behind in: the Space command
    // surface, which held one identifier over two things, and the agent-facing
    // document that pointed at a deleted module. A file list that quietly
    // stopped resolving would report nothing forever. The surface is the
    // Command Dock now — `SpaceSidebar.tsx` stood here until ADR 0082 retired
    // it — and the canary follows the component rather than the filename.
    expect(scanned).toContain('packages/app/src/components/CommandDock.tsx');
    expect(scanned).toContain('docs/agents/ui.md');
    expect(scanned.filter((file) => file.endsWith('.tsx')).length).toBeGreaterThan(0);
  });

  it('finds no name the canvas renderer was called after its control', () => {
    const found = scanned.flatMap((file) => {
      const source = readTracked(file);
      return source === null
        ? []
        : hits(source, RETIRED_RENDERER_NAME).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('reports the field the aggregate stopped carrying, the way a document writes it', () => {
    // The document is what this arm keeps honest, and a document names a field
    // in prose rather than in a declaration. Composed from the constant above
    // for the same reason every retired name here is: written out, the fixture
    // would be a hit this scan reports against its own file.
    const retired = [
      `takes the row naming the current canvas (\`${RETIRED_AGGREGATE_FIELD}\`)`,
      `whether \`${RETIRED_AGGREGATE_FIELD}\` is computed or authored`,
    ];

    for (const line of retired) {
      expect(RETIRED_RENDERER_NAME.test(line), line).toBe(true);
    }
  });

  /**
   * The indirection ADR 0079 removed, in the shapes it was written in.
   *
   * These lines were the *silent* half of this block until that work landed:
   * they were the current names, and what they proved was that the entries above
   * them did not over-match their own replacements. Retiring them inverts them,
   * which is the whole change — the same fixture text, asserted the other way.
   * A rename that leaves a line in the silent arm has retired nothing.
   *
   * Composed from the two constants where one exists, for this file's usual
   * reason; the rest are assembled here rather than written out, so this file
   * still reads like every other tracked one under its own scan.
   */
  it('reports every spelling the Diagram indirection was written in', () => {
    const aggregate = ['Resolved', 'Renderer'].join('');
    const row = ['Canvas', 'Renderer'].join('');
    const retired = [
      `export function ${RETIRED_SELECTED_CANVAS}({ ${['renderer'].join('')} }: { readonly ${['renderer'].join('')}: ${row} }) {`,
      `import type { ${row}s, ${row} } from '../${['canvas', '-renderers'].join('')}';`,
      `const key = ${['canvasRenderer', 'Key'].join('')}(selected);`,
      `const current = ${['current', 'Renderer'].join('')}(renderers, navigationState.${['selected', 'Renderer'].join('')});`,
      `const ${['resolve', 'Renderer'].join('')} = ${['createRenderer', 'Resolver'].join('')}();`,
      `function openedState(selection: ${row}Id, view: ${aggregate}) {`,
      `<button ${['data-', 'renderer'].join('')}={diagram.id} data-testid="${['canvas', '-renderer'].join('')}" />`,
    ];

    for (const line of retired) {
      expect(RETIRED_RENDERER_NAME.test(line), line).toBe(true);
    }
  });

  it('stays silent on the names that replaced them, and on the foreign ones', () => {
    // What the scan must not report: the vocabulary this rename arrived at, and
    // three names that are not ours to sweep — React Flow's edge-label renderer
    // and its own class, and the function type that renders a React element.
    const kept = [
      `export function SelectedDiagramName({ diagram }: { readonly diagram: Diagram }) {`,
      `import { resolveDiagram, diagramThings } from '../diagram-resolution';`,
      `const selected = diagrams.find((diagram) => diagram.id === selectedDiagramId);`,
      `<button data-diagram-id={diagram.id} data-testid="diagram-row" />`,
      `navigation.selectDiagram(diagramId); navigation.continueInDiagram(diagramId, graphId);`,
      `expect(errors[0]?.kind).toBe('unresolved-default-diagram');`,
      `import { EdgeLabelRenderer } from '@xyflow/react';`,
      `element.className = 'react-flow__renderer';`,
      `export type SpaceAppRenderer = (element: ReactElement) => void;`,
    ];

    for (const line of kept) {
      expect(RETIRED_RENDERER_NAME.test(line), line).toBe(false);
    }
  });
});

/**
 * `CONTEXT.md` lists the retired chrome word under Space's `_Avoid_` for two
 * readings — the loaded Space itself, and the app chrome around it — and the
 * code drifted from that entry for months with nothing reading for it. Issue
 * 08 closed the drift. This is what stops it reopening, and the word is the
 * one most likely to try: unlike the names above, it is what every other tool
 * in the ecosystem calls this shape of thing, so an agent reaches for it
 * unprompted.
 *
 * Neither block above transfers. ADR 0041's trick was that a *compound* is
 * unambiguous while the bare English word is fine, and here that is inverted —
 * pnpm's sense is written in compounds too, so no shape rule separates the two
 * senses in code. A bare-word scan over the whole tree reports 25 files and
 * ~131 occurrences, every one of them pnpm's, which is the ever-growing
 * exception list ADR 0041's own comment rejects.
 *
 * So the senses are separated by **where they can live** rather than by how
 * they are spelled. The bare word is read over the source the repo authors —
 * `packages/**`, `src/**`, `test/**`, `scripts/**` and the root `.ts` configs
 * — and the root tool configuration is out, because `eslint.config.js`,
 * `.oxlintrc.json`, `.coderabbit.yaml`, `ci.yml` and the two `pnpm-*.yaml`
 * files are each written in some tool's vocabulary and hold no domain name.
 * That falls outside by construction rather than by exemption.
 *
 * The first draft stopped at `packages/**` and `src/**`, which is what the
 * ticket measured. It was wrong: issue 08's rename also had to clean
 * `vitest.setup.ts` and four files under `test/unit/`, so the guard could not
 * see the places the drift had actually reached. Widening cost two exemptions,
 * both pnpm's toolchain check and its test.
 */
const RETIRED_LOOSE_NAME = ['work', 'space'].join('');
const RETIRED_LOOSE_NAME_CAPITAL = ['Work', 'space'].join('');

/**
 * The bare word, in any casing. Inside the scanned paths there is no other
 * sense left to confuse it with, so nothing narrower is needed there.
 */
const RETIRED_LOOSE_BARE = new RegExp(RETIRED_LOOSE_NAME, 'i');

/**
 * The retired word in the **shapes issue 08 actually wrote it in**, which is
 * what makes a second arm safe to run over documents the path scope cannot
 * reach. Every monorepo mention in a document is bare and lowercase — pnpm's
 * packages, a pnpm one, the `exports` Vite resolves through — while the domain
 * sense only ever appeared as an identifier, a test id, a CSS block or a module
 * name. Measured over the 46 tracked Markdown files outside the historical
 * trees, this pattern reports none of them, so that arm carries no exemption
 * list at all.
 *
 * Two carve-outs are shape rather than exception, in the idiom ADR 0041's
 * `Routed*` uses: pnpm's own kebab compound is the alias module's name, and
 * `pnpm-` prefixes the manifest that lists the packages. Both have to stay
 * writable, because the AGENTS.md line saying where the monorepo sense is
 * allowed has to be able to name them.
 *
 * **Three seams are known and taken deliberately, because the shapes that
 * close them are the ones worth reading.** The capitalised bare word opening a
 * sentence is reported; so is a kebab modifier pnpm could legitimately write;
 * and so are pnpm's two exported camelCase names, which `build-tooling.md`
 * would trip on the day it explains the alias table by identifier rather than
 * by module. None is in the tree. What those arms buy is the retired entity
 * written as a proper noun — every domain noun here is capitalised — the
 * retired module a document sends the next agent to, and the retired
 * component. A false positive fails loudly with a file:line and is one
 * decision to take; a document quietly naming a deleted module is the defect
 * that has already happened twice. The camelCase seam is left open rather than
 * carved out because no document names those two today, and an exception
 * without a live justification is what the ticket warns against.
 */
const RETIRED_LOOSE_COMPOUND = new RegExp(
  [
    // PascalCase compounds opening with it: the sidebar, the selection, the
    // failure view, the startup.
    `${RETIRED_LOOSE_NAME_CAPITAL}[A-Z]`,
    // Compounds ending in it: what opened one, what mounted one.
    `[A-Za-z]${RETIRED_LOOSE_NAME_CAPITAL}\\b`,
    // The bare capitalised word, which is the retired module and the entity
    // `CONTEXT.md` says to call a Space.
    `\\b${RETIRED_LOOSE_NAME_CAPITAL}\\b`,
    // camelCase compounds opening with it: its title, its chrome.
    `\\b${RETIRED_LOOSE_NAME}[A-Z]`,
    // A test id, a CSS block, a story id — minus pnpm's alias module.
    `\\b${RETIRED_LOOSE_NAME}-(?!aliases\\b)[a-z]`,
    // ...and the same positions with it on the right: the retired module the
    // Space is opened by, minus the manifest that lists the packages.
    `(?<!pnpm)-${RETIRED_LOOSE_NAME}\\b`,
  ].join('|'),
);

/**
 * The source the repo authors, which is everywhere the domain can be written.
 * Deliberately broader than `isImplementationSource` — the rename crossed E2E
 * specs, Ladle stories, story fixtures, `styles.css`, the root unit tests and
 * `vitest.setup.ts`, and only the first of those sits under a `src/`.
 */
const AUTHORED_TREES = ['packages/', 'src/', 'test/', 'scripts/'] as const;

const isAuthoredSource = (file: string): boolean =>
  AUTHORED_TREES.some((tree) => file.startsWith(tree)) ||
  (!file.includes('/') && file.endsWith('.ts'));

/**
 * The five modules that are pnpm's vocabulary rather than ours: the alias
 * table, the two Vite configs that import it, and the toolchain check that
 * reads the package list plus its test. Composed from the fragment above for
 * the same reason every retired name in this file is — written out, this file
 * would hold the word it bans, and it is scanned now that `test/` is in scope.
 */
const MONOREPO_VOCABULARY: readonly string[] = [
  `packages/app/${RETIRED_LOOSE_NAME}-aliases.ts`,
  'packages/app/vite.config.ts',
  'packages/app/http-server-build.config.ts',
  'scripts/check-typescript-toolchain.ts',
  'test/unit/check-typescript-toolchain.test.ts',
];

/** A package manifest, anchored at a package root rather than by filename. */
const MONOREPO_MANIFEST = /^packages\/[^/]+\/package\.json$/;

/**
 * The bare-word hits a file is answerable for.
 *
 * A manifest is exempted **for the dependency protocol and nothing else**, so
 * the protocol line is what is forgiven rather than the file: a script name, an
 * `imports` entry or a renamed package lands in a manifest and nowhere else,
 * and exempting the file would let all three through. That also keeps the
 * exemption one rule rather than six paths — the protocol is in every manifest
 * that depends on a sibling, and a new package brings another.
 */
const reportableHits = (file: string, source: string): string[] => {
  const found = hits(source, RETIRED_LOOSE_BARE);
  return MONOREPO_MANIFEST.test(file)
    ? found.filter((hit) => !hit.includes(`"${RETIRED_LOOSE_NAME}:`))
    : found;
};

describe('the name used loosely for a Space and its chrome is gone', () => {
  const scanned = scannableFiles();
  const authored = scanned
    .filter(isAuthoredSource)
    .filter((file) => !MONOREPO_VOCABULARY.includes(file));
  const documents = scanned.filter((file) => file.endsWith('.md'));

  it('reaches the kinds of file the rename actually touched', () => {
    // The component the chrome was named after, the stylesheet whose block
    // names moved with it, and the two outside `packages/` that the first draft
    // of this scope could not see. A file list that quietly stopped resolving
    // would report nothing forever.
    expect(authored).toContain('packages/app/src/components/CommandDock.tsx');
    expect(authored).toContain('packages/app/src/styles.css');
    expect(authored).toContain('test/unit/app-http-startup.test.ts');
    expect(authored).toContain('vitest.setup.ts');
    expect(authored.filter((file) => file.endsWith('.tsx')).length).toBeGreaterThan(0);
    expect(authored.filter((file) => file.endsWith('.ts')).length).toBeGreaterThan(0);
    expect(authored.filter((file) => file.endsWith('.css')).length).toBeGreaterThan(0);
  });

  it('finds no retired word in the source the repo authors', () => {
    const found = authored.flatMap((file) => {
      const source = readTracked(file);
      return source === null ? [] : reportableHits(file, source).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('reads the documents an agent is sent to before touching the code', () => {
    // The second arm is worth having because documents are where both blocks
    // above found their bug: ADR 0055's caught `docs/agents/ui.md` pointing the
    // next agent at a deleted module, and issue 08's own third review round
    // caught the same file again. These three are read-before-touching
    // authorities, and none of them is authored source.
    expect(documents).toContain('AGENTS.md');
    expect(documents).toContain('CONTEXT.md');
    expect(documents).toContain('docs/agents/ui.md');
  });

  it('finds no retired compound in the documents that direct the next agent', () => {
    const found = documents.flatMap((file) => {
      const source = readTracked(file);
      return source === null
        ? []
        : hits(source, RETIRED_LOOSE_COMPOUND).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('keeps no exemption that has stopped earning itself', () => {
    expectEachExemptionEarned(MONOREPO_VOCABULARY, RETIRED_LOOSE_BARE);

    // The protocol rule earns itself as a rule rather than per manifest:
    // `core` declares no sibling and holds no hit, and requiring every manifest
    // to carry one would fail on a package that is simply a leaf. What has to
    // still be true is that the forgiveness is forgiving something.
    const manifests = scanned.filter((file) => MONOREPO_MANIFEST.test(file));
    expect(manifests.length, 'the protocol rule exempts nothing').toBeGreaterThan(0);
    expect(
      manifests.filter((file) => {
        const source = readTracked(file) ?? '';
        return hits(source, RETIRED_LOOSE_BARE).length > reportableHits(file, source).length;
      }),
      'no manifest still uses the protocol its exemption exists for',
    ).not.toEqual([]);
  });
});

/**
 * Both patterns above are only as sharp as what they match, and one that
 * silently stopped matching would pass every file forever. Read them against
 * the names issue 08 retired, and against pnpm's.
 *
 * The two arms are kept honest differently, and this says which does which.
 * The bare word matches pnpm's spellings too — it is *where* they sit that
 * keeps them silent — so the domain arm's half of this reads the exemption
 * predicate rather than the pattern.
 */
describe('the vocabulary the loose-name guard reads', () => {
  it('reports the retired names in every shape they were written in', () => {
    const retired = [
      `export function ${RETIRED_LOOSE_NAME_CAPITAL}Sidebar({ navigation }: Props) {`,
      `const opened = openStored${RETIRED_LOOSE_NAME_CAPITAL}(repository);`,
      `mount${RETIRED_LOOSE_NAME_CAPITAL}(document.getElementById('root'));`,
      `const ${RETIRED_LOOSE_NAME}Title = space.title;`,
      `<div data-testid="${RETIRED_LOOSE_NAME}-sidebar">`,
      `.${RETIRED_LOOSE_NAME}-selection { display: grid; }`,
      `components--${RETIRED_LOOSE_NAME}-sidebar--settled`,
      // A document naming the retired module, which is the failure ADR 0055's
      // block caught: the word is on the right of the kebab there.
      `see \`packages/app/src/open-${RETIRED_LOOSE_NAME}.ts\``,
      // The bare capitalised word, which is the entity CONTEXT.md renames.
      `The ${RETIRED_LOOSE_NAME_CAPITAL} is the app chrome around the canvas.`,
    ];

    for (const line of retired) {
      expect(RETIRED_LOOSE_BARE.test(line), line).toBe(true);
      expect(RETIRED_LOOSE_COMPOUND.test(line), line).toBe(true);
    }
  });

  it('stays silent on the monorepo prose the document arm reads', () => {
    const kept = [
      `Seven \`@project/*\` ${RETIRED_LOOSE_NAME} packages under \`packages/\`:`,
      `A pnpm ${RETIRED_LOOSE_NAME} with strict TypeScript and enforced boundaries`,
      `Vite needs no alias at all — it resolves through the ${RETIRED_LOOSE_NAME} \`exports\``,
      `a bare specifier is externalized and hands Node the ${RETIRED_LOOSE_NAME} TypeScript`,
      // The two names the AGENTS.md gotcha line has to be able to write.
      `the pnpm sense stays in \`packages/app/${RETIRED_LOOSE_NAME}-aliases.ts\``,
      `\`pnpm-${RETIRED_LOOSE_NAME}.yaml\` lists the packages`,
    ];

    for (const line of kept) {
      expect(RETIRED_LOOSE_COMPOUND.test(line), line).toBe(false);
    }
  });

  it('leaves pnpm the compounds it writes in code, by the file and by the line', () => {
    // The bare word cannot tell the senses apart, so all three of pnpm's own
    // spellings are hits. Naming both halves is the point: the pattern matching
    // them is exactly what the two mechanisms below exist for.
    const pnpmCompounds = [
      `import { ${RETIRED_LOOSE_NAME}Aliases } from './${RETIRED_LOOSE_NAME}-aliases';`,
      `export const ${RETIRED_LOOSE_NAME}Packages = Object.keys(${RETIRED_LOOSE_NAME}Aliases());`,
      `    "@project/core": "${RETIRED_LOOSE_NAME}:*",`,
    ];

    for (const line of pnpmCompounds) {
      expect(RETIRED_LOOSE_BARE.test(line), line).toBe(true);
    }

    // The first two are silent because the module holding them is pnpm's.
    expect(MONOREPO_VOCABULARY).toContain(`packages/app/${RETIRED_LOOSE_NAME}-aliases.ts`);
    expect(MONOREPO_VOCABULARY).not.toContain('packages/app/src/components/CommandDock.tsx');

    // The third is silent because of the line it is on, and a manifest is
    // forgiven that line and nothing else — a script name, an `imports` entry
    // or a renamed package lands in a manifest and is still reported.
    const manifest = 'packages/app/package.json';
    expect(reportableHits(manifest, pnpmCompounds[2] ?? '')).toEqual([]);
    expect(
      reportableHits(manifest, `  "scripts": { "dev:${RETIRED_LOOSE_NAME}": "vite" }`),
    ).not.toEqual([]);
    expect(reportableHits(manifest, `  "name": "@project/${RETIRED_LOOSE_NAME}-ui",`)).not.toEqual(
      [],
    );

    // Nothing outside a manifest is forgiven a line at all.
    expect(
      reportableHits('packages/app/src/space.ts', `const ${RETIRED_LOOSE_NAME}: Space = load();`),
    ).not.toEqual([]);
  });
});

/**
 * The retired name for the surface over the open set.
 *
 * Built from fragments for the reason every other retired word here is: this
 * file is scanned like any other tracked file, and a literal would make the one
 * document that talks about the word the one place it could hide.
 *
 * `CONTEXT.md` names Open Spaces as both the set and the surface that draws it.
 * The retired word named the set after `switchTo`, the operation that spends
 * it, which is an implementation name promoted to a product one. It was never
 * in `CONTEXT.md` or any ADR — it entered in a commit comment and was copied
 * across a prototype until it read as settled vocabulary. ADR 0082 leaves what
 * the surface is *called* to stories and tests, which is why this is a scan
 * rather than a decision record: nothing above it was ever going to catch it.
 */
const RETIRED_SURFACE = ['s', 'witcher'].join('');
const RETIRED_SURFACE_NAME = new RegExp(RETIRED_SURFACE, 'i');

/**
 * Where the word is not the retired one.
 *
 * `CONTEXT.md` has to name what it retires, which is the carve-out every block
 * above already makes for the document that does the retiring.
 *
 * The space-thing prototype's variant control — the retired word carrying a
 * `Variant` prefix — moves that prototype between its own story variants. It
 * switches variants rather than Spaces, so ADR 0082 and
 * `CONTEXT.md` have nothing to say about it, and the scan cannot tell the two
 * apart because they are spelled identically — the same shape of exemption
 * `FOREIGN_BARE_FILES` makes for Lucide's glyph, and a **file** exemption for
 * the same reason: there is no shape to read. It is scoped to the two files
 * that draw that control, so the name cannot spread behind it.
 *
 * Each is held below to still be earning itself, so deleting the prototype
 * deletes its exemption rather than leaving a hole.
 */
const RETIRED_SURFACE_FILES: readonly string[] = [
  'CONTEXT.md',
  'packages/app/stories/review/space-thing-canvas-prototype.stories.tsx',
  'packages/app/stories/review/space-thing-canvas-prototype.css',
];

describe('the retired name for the surface over the open set is gone', () => {
  it('finds it nowhere Open Spaces is what is meant', () => {
    const offenders = scannableFiles()
      .filter((file) => !RETIRED_SURFACE_FILES.includes(file))
      .flatMap((file) => {
        const source = readTracked(file);
        return source === null
          ? []
          : hits(source, RETIRED_SURFACE_NAME).map((hit) => `${file}:${hit}`);
      });

    expect(offenders).toEqual([]);
  });

  it('holds each exemption to still earning itself', () => {
    expectEachExemptionEarned(RETIRED_SURFACE_FILES, RETIRED_SURFACE_NAME);
  });

  it('reads the shapes the word was actually written in', () => {
    // The prose noun, the camelCase local, the PascalCase component and the
    // kebab-case union member and CSS block — every spelling the rename found.
    for (const spelling of [
      `the ${RETIRED_SURFACE} holds the rest`,
      `const ${RETIRED_SURFACE} = controls === 'parent-and-${RETIRED_SURFACE}';`,
      `function Spaces${RETIRED_SURFACE.replace('s', 'S')}({`,
      `.dock__${RETIRED_SURFACE} {`,
    ]) {
      expect(RETIRED_SURFACE_NAME.test(spelling), spelling).toBe(true);
    }
  });
});

/**
 * ADR 0085 makes Diagram the first-public name for the entity that was a
 * Layout, and states the same completion criterion ADR 0041 did: a repository
 * scan finds the retired name only in historical records and in qualified
 * layout-strategy prose. This is the first of that ADR's two changes; the
 * second retires the other noun and gains its own block here.
 *
 * The shape rule transfers from ADR 0041 exactly, and for the same reason: the
 * bare English word is legitimate — a strategy lays things out, the Command Dock
 * takes no layout space, React Flow's docs have a layouting page — while a
 * compound is unambiguous. Nothing writes the retired id, the retired
 * collection or the retired opening field by accident.
 *
 * **Two carve-outs are shape rather than exception**, in the `Routed*` idiom
 * this file already uses:
 *
 *  - `LayoutStrategy` and everything built on it keeps its name, which ADR 0085
 *    records as a negative in as many words. The word there is the verb: two of
 *    its three implementations read no Diagram at all, so naming the contract
 *    after the entity would assert a relationship they do not have and would
 *    reintroduce the conflation ADR 0014 exists to correct.
 *  - React's `useLayoutEffect` is a hook, not a domain type, and it is spelled
 *    the one way a lookbehind can separate from the entity.
 *
 * What is left needing a **file** exemption is what needs one for the same
 * reason `packages/ui/src/icons.tsx` already has one above: a foreign name,
 * with no shape to read. Lucide exports the grid glyph under the retired word,
 * and elkjs names both its options bag and its per-element field after it —
 * three identifiers spelled exactly as the entity was, in someone else's
 * catalogue. Each file is asserted to still be earning itself, so a dependency
 * that stops exporting one deletes the exemption rather than leaving a hole.
 * They are not written out here for the reason nothing retired is written out
 * in this file: it is read by its own scan.
 */
const RETIRED_DIAGRAM = ['L', 'ayout'].join('');
const retiredDiagramLower = RETIRED_DIAGRAM.toLowerCase();
const RETIRED_DIAGRAM_UPPER = RETIRED_DIAGRAM.toUpperCase();

const RETIRED_DIAGRAM_NAME = new RegExp(
  [
    // PascalCase compounds opening with it: its id, its schema, its error. The
    // lookbehind is React's hook; the lookahead is the strategy contract.
    `(?<!use)${RETIRED_DIAGRAM}(?!Strategy)[A-Z]`,
    // Compounds ending in it: the selected one, the default one, the resolved one.
    // `s?` because a lowercase plural ends the word without a boundary landing
    // after the retired name, so every compound that ended in its plural — the
    // `with`, `stored` and `Arb` ones this rename actually carried — was
    // invisible to this arm until it was there.
    `[A-Za-z]${RETIRED_DIAGRAM}s?\\b`,
    // camelCase compounds opening with it: its id, its things, its title.
    `\\b${retiredDiagramLower}(?!Strategy)[A-Z]`,
    // The screaming-case constants: the bare word, its plural, its fixtures.
    `\\b${RETIRED_DIAGRAM_UPPER}S?\\b`,
    // Deliberately without a leading `\\b`: `_` is a word character, so a
    // boundary never lands mid-identifier and the shape most of this rename
    // was written in — the retired word between two underscores — goes unseen.
    `${RETIRED_DIAGRAM_UPPER}_[A-Z]`,
    // The retired field, singular and plural, in a document or an object
    // literal. The singular is the Space Thing frontmatter key, which ADR 0079's
    // still-open Ticket 04 is the next work to touch.
    // `(?<!-)` because a hyphen makes it a different word, and prose about
    // re-running a strategy ends the clause with a colon exactly as a key does.
    `(?<!-)\\b${retiredDiagramLower}s?["']?\\s*[:=]`,
    // ...and read back off a value.
    `\\.${retiredDiagramLower}s\\b`,
    // The kebab-case compounds, which are the shape most of this rename was
    // written in: refusal codes, completion kinds, test ids and CSS blocks. A
    // hyphen is not a word character, so `\\b` lands either side of the retired
    // word and every compound arm above reads straight past it. Qualified
    // spellings are masked out before the scan rather than carved out here —
    // see `withoutQualifiedSpellings`, which is where a path citation, a
    // foreign glyph and the verb are separated from the entity.
    `${retiredDiagramLower}-[a-z]`,
    // `(?![a-z])` rather than `\\b`: an underscore is a word character, so no
    // boundary lands after the retired word in a BEM block and `.canvas-x__rail`
    // would read as clean. Nothing in the tree hides behind it today — this
    // closes the gap the sibling block below found rather than fixing a site.
    `[a-z]-${retiredDiagramLower}s?(?![a-z])`,
    // The optional field. The key arm above cannot cross the `?`, and this is
    // the declared shape of the Space Thing frontmatter key ADR 0079 still owes.
    `\\b${retiredDiagramLower}s?\\?\\s*:`,
    // The callback binding this repo's own convention writes, where the retired
    // word is the whole parameter and no capital follows it to end a compound.
    `\\(\\s*${retiredDiagramLower}\\s*\\)\\s*=>`,
    // The screaming constant with no trailing segment. The underscore arm above
    // needs a following capital, so a bare `DEFAULT_` prefix went unseen behind
    // it, an underscore being a word character. The lookbehind is the
    // verb in the one screaming-case shape that keeps it, a CSS class group,
    // in the same idiom `(?<!use)` separates React's hook above.
    `(?<!GROUP)_${RETIRED_DIAGRAM_UPPER}\\b`,
  ].join('|'),
);

/**
 * The retired name standing alone, which no compound arm can see. ADR 0085
 * states the completion criterion ADR 0041 did — the word does not survive as
 * an alias — and `RETIRED_BARE` above is what holds that for Route. The two
 * names that keep the word need no exemption here: a boundary cannot land
 * inside the strategy contract, React's hook or Lucide's glyph.
 */
const RETIRED_DIAGRAM_BARE = new RegExp(`\\b${RETIRED_DIAGRAM}\\b`);

/**
 * The four foreign spellings the exemption below forgives: Lucide's grid glyph,
 * elkjs's options bag on the type and on the element field, and the screaming
 * case our own default for that bag is declared in.
 */
const FOREIGN_DIAGRAM_SPELLINGS = new RegExp(
  [
    `${RETIRED_DIAGRAM}Grid`,
    `${RETIRED_DIAGRAM}Options`,
    `${retiredDiagramLower}Options`,
    `${RETIRED_DIAGRAM_UPPER}_OPTIONS`,
    // elkjs's own engine method, which is spelled exactly like the retired
    // singular field the arm above reads.
    `${retiredDiagramLower}: \\(`,
  ].join('|'),
);

/**
 * An exempted file read with those three spellings masked out. Masking rather
 * than skipping is the point: a retired domain compound added to one of these
 * modules is our vocabulary wearing a forgiven file's name, and it stays
 * visible to the scan.
 */
const withoutForeignSpellings = (source: string): string =>
  source.replace(new RegExp(FOREIGN_DIAGRAM_SPELLINGS.source, 'g'), 'foreign');

/**
 * A retired name quoted as **history** rather than used as vocabulary.
 *
 * ADR 0085 requires this: accepted ADR bodies and resolved records keep the old
 * words as provenance, and a current-state document that explains what changed
 * has to be able to name what it changed from. Two do — the trap a persisted-key
 * rename set twice, and the symbol a stale spike harness went stale against —
 * and renaming either does not update a record, it falsifies one.
 *
 * Masked rather than exempted by file, in the idiom directly above: only these
 * two quotations are forgiven, and the rest of both documents stays governed.
 * Each is asserted below to still be present, so a document that stops telling
 * the story stops carrying the licence to tell it.
 */
const HISTORICAL_QUOTATIONS = [
  ['`default', 'View` → `default', 'Layout`'].join(''),
  ['elk', 'Layout` → `elkStrategy'].join(''),
  // The module this rename moved, named in AGENTS.md's own account of the move
  // — the sentence exists to tell a rebasing branch which similarity threshold
  // git needs to follow it, so it has to spell where it came from.
  `${retiredDiagramLower}-resolution`,
  // The two addressing names that went with the retired gutter (ADR 0082): the
  // continuation's control value and the row attribute beside it. Both are
  // recorded as gone, in a document and in the test that pinned the behaviour.
  `${retiredDiagramLower}-header`,
  `data-${retiredDiagramLower}-id`,
] as const;

const withoutHistoricalQuotations = (source: string): string =>
  HISTORICAL_QUOTATIONS.reduce((text, quotation) => text.split(quotation).join('history'), source);

/**
 * Spellings where the retired word is **qualified** — it names a path, a
 * foreign glyph, the verb, or someone else's guidance about CSS — rather than
 * naming the entity.
 *
 * The kebab arms exist because that is the shape this rename mostly carried, and
 * they are the only arms broad enough to need this: a hyphen ends a word, so
 * they see every hyphenated occurrence including the ones ADR 0085 deliberately
 * leaves in the old spelling. Three kinds, and they are three different
 * arguments:
 *
 *  - **A path is not vocabulary.** `.scratch/` and `docs/adr/` are trees this
 *    rename does not rewrite, so a current-state document that cites one cites
 *    it under the name it has on disk. Renaming a citation does not update a
 *    record, it breaks a link — the failure this repository's own guards record
 *    as having already happened twice. Masked by shape, as any run of
 *    non-whitespace carrying a `/`, plus the `NNNN-` filename form an ADR row
 *    and the roadmap generator both write bare.
 *  - **A foreign glyph arrives with a dependency.** Lucide spells its two grid
 *    icons with the retired word, and they are names in someone else's
 *    catalogue rather than ours to sweep.
 *  - **The verb keeps the word** (ADR 0014, ADR 0085), in the hyphenated shapes
 *    the strategy contract and the prose about arranging a screen are written
 *    in.
 *
 * Each is held below to still be earning itself, so a spelling that leaves the
 * tree takes its mask with it rather than leaving a hole.
 */
const QUALIFIED_SPELLINGS: readonly string[] = [
  // Lucide's two grid glyphs.
  `${retiredDiagramLower}-grid`,
  `${retiredDiagramLower}-dashboard`,
  // The verb: the contract, the engine, the caller's own arranging, and the
  // prose about re-running one.
  `${retiredDiagramLower}-strategy`,
  `graph-${retiredDiagramLower}`,
  `caller-${retiredDiagramLower}`,
  `re-${retiredDiagramLower}`,
  // The tracked fixture's name. The unhyphenated phrase is already the verb by
  // the rename script's own reckoning, which protects `${retiredDiagramLower} fixture`
  // as prose about arranging rather than as the entity; the hyphenated form is
  // the same phrase and takes the same reading.
  `abstract-${retiredDiagramLower}`,
  // Vendored third-party guidance, pinned by `skills-lock.json`: shadcn's rule
  // about composing a form. It is the CSS sense, and a colon after the word is
  // what makes the field arm read it as the retired key. This one spelling is
  // the whole of what that tree needs forgiven — masked, so the rest of it stays
  // governed, rather than skipped as a tree, which would have widened every
  // block in this file and left a bump in the pinned skills invisible.
  `Form ${retiredDiagramLower}:`,
];

const CITED_PATH = /\S*\/\S*|\b\d{4}-[a-z0-9-]+/g;

const withoutQualifiedSpellings = (source: string): string =>
  QUALIFIED_SPELLINGS.reduce(
    (text, spelling) => text.split(spelling).join('qualified'),
    source.replace(CITED_PATH, 'path'),
  );

/**
 * The files where the retired spelling is a **foreign** identifier rather than
 * a domain one — Lucide's glyph and elkjs's options bag. A file exemption
 * rather than a shape one precisely because there is no shape to read: these
 * are spelled exactly as the entity was.
 *
 * Both are scoped to the module that owns the dependency — `icons.tsx` is the
 * only module allowed to import Lucide at all, and the elk directory is where
 * ADR 0014 confines elkjs — so a foreign name cannot spread behind them.
 */
const FOREIGN_DIAGRAM_FILES: readonly string[] = [
  'packages/ui/src/icons.tsx',
  'packages/react-flow-adapter/src/elk/layout.ts',
  'packages/react-flow-adapter/src/elk/elk-strategy.ts',
  'packages/react-flow-adapter/test/elk-strategy.test.ts',
];

describe('a Diagram is named once (ADR 0085)', () => {
  const scanned = scannableFiles();

  it('reaches the kinds of file this rename actually touched', () => {
    // The domain schema, the resolver the app reads a Diagram through, and the
    // agent-facing document that describes both. A file list that quietly
    // stopped resolving would report nothing forever.
    expect(scanned).toContain('packages/core/src/schema.ts');
    expect(scanned).toContain('packages/app/src/diagram-resolution.ts');
    expect(scanned).toContain('docs/agents/editing-and-persistence.md');
  });

  it('finds no compound of the retired name anywhere it still governs', () => {
    const found = scanned.flatMap((file) => {
      const source = readTracked(file);
      if (source === null) return [];
      const foreign = FOREIGN_DIAGRAM_FILES.includes(file)
        ? withoutForeignSpellings(source)
        : source;
      return hits(
        withoutQualifiedSpellings(withoutHistoricalQuotations(foreign)),
        RETIRED_DIAGRAM_NAME,
      ).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('keeps no exemption that has stopped earning itself', () => {
    // Read against the spellings it was granted against: the day a dependency
    // stops exporting one, the exemption stops being earned and goes.
    expectEachExemptionEarned(FOREIGN_DIAGRAM_FILES, FOREIGN_DIAGRAM_SPELLINGS);

    // The same rule for the two historical quotations: each is forgiven only
    // while some tracked document is still telling that story.
    const everything = scanned.map((file) => readTracked(file) ?? '').join('\n');
    for (const quotation of HISTORICAL_QUOTATIONS) {
      expect(everything, `no document still quotes ${quotation}`).toContain(quotation);
    }

    // And for every qualified spelling: a mask outlives its reason the moment
    // nothing writes the spelling it forgives, and a mask with no reason is a
    // hole. Read against everything scanned, historical trees excluded — the
    // same set the mask is applied to.
    for (const spelling of QUALIFIED_SPELLINGS) {
      expect(everything, `nothing tracked still writes ${spelling}`).toContain(spelling);
    }
  });

  it('still reports a domain compound inside a foreign-name exemption', () => {
    const source = [
      `import type { ${RETIRED_DIAGRAM}Options } from 'elkjs';`,
      `const options: ${RETIRED_DIAGRAM}Options = { ...node.${retiredDiagramLower}Options };`,
      `const chosen = space.default${RETIRED_DIAGRAM};`,
    ].join('\n');

    expect(hits(withoutForeignSpellings(source), RETIRED_DIAGRAM_NAME)).toEqual([
      `3: const chosen = space.default${RETIRED_DIAGRAM};`,
    ]);
  });

  it('finds no bare retired name in implementation source', () => {
    const found = scanned.filter(isImplementationSource).flatMap((file) => {
      const source = readTracked(file);
      return source === null
        ? []
        : hits(source, RETIRED_DIAGRAM_BARE).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('reports the retired name in every shape it was written in', () => {
    // Composed rather than written out, in this file's usual idiom: spelled
    // literally, each fixture would be a hit this scan reports against its own
    // source.
    const retired = [
      `export type ${RETIRED_DIAGRAM}Id = string;`,
      `import { ${RETIRED_DIAGRAM}NotFoundError } from './${retiredDiagramLower}-resolution';`,
      `const selected${RETIRED_DIAGRAM} = space.${retiredDiagramLower}s[0];`,
      `const ${retiredDiagramLower}Things = resolve${RETIRED_DIAGRAM}(space, id);`,
      `const ${RETIRED_DIAGRAM_UPPER}_ID = uuidSchema.parse('...');`,
      `const SECOND_${RETIRED_DIAGRAM_UPPER}_ID = uuidSchema.parse('...');`,
      `const DELETE_${RETIRED_DIAGRAM_UPPER}_ACTION_ID = 'x';`,
      `{ "${retiredDiagramLower}s": [], "default${RETIRED_DIAGRAM}": null }`,
      `for (const entry of space.${retiredDiagramLower}s) {`,
      // The kebab-case shapes, which are most of what this rename actually
      // carried: a refusal code, a completion kind, a test id, a CSS block. A
      // hyphen is not a word character, but a compound arm anchored on a letter
      // class either side of the word cannot see one, and the field arm rules a
      // leading hyphen out by name.
      `refusal: { code: '${retiredDiagramLower}-not-found' },`,
      `return 'space-must-keep-${retiredDiagramLower}';`,
      `<div data-testid="space-${retiredThingLower}-${retiredDiagramLower}">`,
      `.${retiredDiagramLower}-header { display: flex; }`,
      // The optional field, whose `?` the field arm's quote-then-colon cannot
      // cross. This is the Space Card frontmatter key's own declared shape.
      `readonly ${retiredDiagramLower}?: UUID;`,
      // The callback binding, where the retired word is the whole parameter
      // name and no capital follows it. This repo's own convention writes it.
      `space.diagrams.map((${retiredDiagramLower}) => ${retiredDiagramLower}.id)`,
      // The screaming constant with no trailing segment, which the underscore
      // arm needs a following capital to see.
      `const DEFAULT_${RETIRED_DIAGRAM_UPPER} = null;`,
    ];

    for (const line of retired) {
      expect(RETIRED_DIAGRAM_NAME.test(line), line).toBe(true);
    }
  });

  it('reports the retired name standing alone', () => {
    for (const line of [
      `export type ${RETIRED_DIAGRAM} = Diagram;`,
      `import type { ${RETIRED_DIAGRAM} } from '@project/core';`,
    ]) {
      expect(RETIRED_DIAGRAM_BARE.test(line), line).toBe(true);
    }

    for (const line of [
      `import type { ${RETIRED_DIAGRAM}Strategy } from './${retiredDiagramLower}';`,
      `const measured = use${RETIRED_DIAGRAM}Effect(() => measure(), []);`,
      `import { ${RETIRED_DIAGRAM}Grid } from 'lucide-react';`,
    ]) {
      expect(RETIRED_DIAGRAM_BARE.test(line), line).toBe(false);
    }
  });

  it('stays silent on the verb, on the foreign names, and on the vocabulary that replaced it', () => {
    const kept = [
      // The contract ADR 0085 records as keeping its name, in every shape.
      `import type { ${RETIRED_DIAGRAM}Strategy, ${RETIRED_DIAGRAM}StrategyGraph } from './${retiredDiagramLower}';`,
      `export const gridStrategy: ${RETIRED_DIAGRAM}Strategy = async (graph) => graph;`,
      `const ${retiredDiagramLower}Strategy = elkStrategy();`,
      // React's hook, which is spelled the one way a lookbehind separates.
      `const measured = use${RETIRED_DIAGRAM}Effect(() => measure(), []);`,
      // The verb, in the prose ADR 0085 leaves alone.
      `// it is furniture over the canvas and takes no ${retiredDiagramLower} space`,
      `const GROUP_${RETIRED_DIAGRAM_UPPER} = 'inline-flex items-center gap-1';`,
      `// see reactflow.dev/learn/${retiredDiagramLower}ing/sub-flows for nesting`,
      // The vocabulary this rename arrived at.
      `const selectedDiagram = space.diagrams.find((diagram) => diagram.id === id);`,
      `export type DiagramId = z.infer<typeof uuidSchema>;`,
    ];

    for (const line of kept) {
      expect(RETIRED_DIAGRAM_NAME.test(line), line).toBe(false);
    }
  });
});

/**
 * ADR 0085 makes Thing the first-public name for the entity that was a Card,
 * and states the same completion criterion ADR 0041 did: a repository scan
 * finds the retired name only in historical records and in the vendored
 * registry carve-out. This is the second of that ADR's two changes; the Diagram
 * block above is the first.
 *
 * **This block is the whole reason the name is Thing and not Object.** The ADR
 * rejected the better-pedigreed word on one ground — that a scan for
 * `Object[A-Z]`, `[A-Za-z]Object`, `object[A-Z]` and `OBJECTS?` already matches
 * 287 sites (`RefObject`, `toMatchObject`, oxlint's `ObjectExpression`), and a
 * domain word whose guard needs 287 exceptions has no guard. The same scan for
 * Thing matched zero. So a rename of this size was accepted *because* this file
 * could hold it, and the acceptance is only cashed here.
 *
 * **The English words need no exemption, which is worth stating because the
 * reconnaissance expected otherwise.** `cardinality` (67), `discard` (148) and
 * `wildcard` (4) are all invisible to every arm below, and not by luck: each
 * arm requires either a capital after the retired word, a word boundary before
 * it, or a key's colon after it, and none of the three offers any. What did
 * need protecting was the *codemod*, which substitutes plain substrings.
 *
 * **`migrations/` is excluded here and nowhere else.** The 21 files it
 * contributes are `start-contract` / `end-contract` snapshots of a schema that
 * really did have a Card model, and ADR 0085 says migration snapshots are
 * history and are not rewritten. It is scoped to this block rather than added
 * to `HISTORICAL_TREES` because that list feeds `scannableFiles()`, which every
 * other block starts from, and none of them has been asked whether it wants the
 * tree gone. `src/prisma/` stays in scope: `contract.prisma` is authored and the
 * two emitted artifacts beside it are regenerated from it, so a retired model
 * name there is a live defect rather than a record.
 *
 * What needs a **file** exemption is what ADR 0085 predicted, and it is the one
 * carve-out: the vendored shadcn registry. `packages/ui/src/components/card.tsx`
 * exports seven components under the retired name, and six other modules import
 * them — a barrel, two components, a baseline test, a review story, and the
 * agent-facing document that explains why the barrel carries two content
 * components with different names. A foreign name with no shape to read, exactly
 * as Lucide's glyph is for Route and elkjs's options bag is for Layout.
 *
 * The registry's Tailwind tokens and custom properties need **nothing**, and
 * the collection-key arm's `(?<!-)` and the qualified masker between them cover
 * every one: each carries a hyphen immediately before the retired word, or a
 * slash, so a rule written to keep prose about re-running a strategy out of a
 * Diagram scan keeps a whole vendored palette out of this one.
 */
const RETIRED_THING = ['C', 'ard'].join('');
const retiredThingLower = RETIRED_THING.toLowerCase();
const RETIRED_THING_UPPER = RETIRED_THING.toUpperCase();

const RETIRED_THING_NAME = new RegExp(
  [
    // PascalCase compounds opening with it: its id, its schema, its node.
    `${RETIRED_THING}[A-Z]`,
    // Compounds ending in it: the canvas one, the space one, the markdown one.
    // `s?` for the reason the Diagram arm above carries it — a lowercase plural
    // ends the word without a boundary landing after the retired name, so every
    // compound that ended in its plural would be invisible to this arm.
    `[A-Za-z]${RETIRED_THING}s?\\b`,
    // camelCase compounds opening with it: its id, its kind, its title.
    `\\b${retiredThingLower}[A-Z]`,
    // The screaming-case constants: the bare word, its plural, its fixtures.
    `\\b${RETIRED_THING_UPPER}S?\\b`,
    // Deliberately without a leading `\\b`: `_` is a word character, so a
    // boundary never lands mid-identifier and the shape most of a screaming
    // constant is written in goes unseen.
    `${RETIRED_THING_UPPER}_[A-Z]`,
    // The retired collection, in a document, an object literal or a table
    // declaration. `(?<!-)` because a hyphen makes it a different word, and it
    // is what keeps the registry's whole Tailwind palette out of this scan.
    `(?<!-)\\b${retiredThingLower}s?["']?\\s*[:=]`,
    // ...and read back off a value.
    `\\.${retiredThingLower}s\\b`,
    // The retired name as a whole quoted string, which is how the database
    // spells it and how no compound arm above can see it: a Prisma `@@map`, a
    // migration's table field, a raw identifier in the repository. Without this
    // the model rename could land with every table name still retired and the
    // scan silent.
    `["']${retiredThingLower}s?["']`,
    // The kebab-case compounds, which are the shape most of this rename was
    // written in and which review of change one found the Diagram block blind
    // to: refusal codes, completion kinds, test ids, CSS blocks and every
    // `data-` attribute. A hyphen is not a word character, so `\\b` lands either
    // side of the retired word and every arm above reads straight past
    // `thing-not-found`, `edited-thing` and `.canvas-thing`. The registry's own
    // hyphenated tokens are the reason the exemption below is masked by
    // spelling rather than skipped by file.
    `${retiredThingLower}-[a-z]`,
    // `(?![a-z])` rather than `\\b`, because an underscore is a word character
    // and no boundary lands after the retired word in a BEM block — which is
    // exactly how this rename's CSS was written: `canvas-thing__rail`,
    // `thing-rail__action`. The Diagram block's `\\b` would have read past every
    // one of them.
    `[a-z]-${retiredThingLower}s?(?![a-z])`,
    // The optional field, which the key arm cannot cross the `?` to reach.
    `\\b${retiredThingLower}s?\\?\\s*:`,
    // The binding written as a whole parameter, where no capital follows the
    // retired word to end a compound. The terminator is `,` as well as `)`,
    // because a binding that takes the index too is the same blind spot this
    // arm was written for, and the arrow is gone from it, because a `function`
    // expression binds the word without one — and an argument passed under the
    // retired name is a survivor of the same sweep either way. The comment
    // cannot spell any of the three, for the reason the fixtures below are
    // composed rather than written out: this scan reads its own source.
    `\\(\\s*${retiredThingLower}s?\\s*[,)]`,
    // The declaration binding, which no parenthesis of its own precedes: the
    // loop variable of a `for...of` over the Thing collection, which a sweep
    // that renames the collection leaves standing.
    `\\b(?:const|let|var)\\s+${retiredThingLower}s?\\b`,
  ].join('|'),
);

/**
 * The retired name standing alone, which no compound arm can see. ADR 0085
 * states the completion criterion ADR 0041 did — the word does not survive as an
 * alias — and this is what holds it. Scoped to implementation source, like the
 * Route and Diagram bare arms, because the bare English word is legitimate in
 * prose and a glossary entry retiring a noun has to spell the noun.
 */
const RETIRED_THING_BARE = new RegExp(`\\b${RETIRED_THING}\\b`);

/**
 * Spellings the kebab arms are broad enough to reach and which ADR 0085
 * deliberately leaves alone, masked out **before** the scan reads any file
 * rather than carved out per file — the idiom `withoutQualifiedSpellings`
 * established for the Diagram block, and needed here for the same reason: a
 * hyphen is what makes a kebab arm see a token at all, and it is also what
 * every one of these is built from.
 *
 * Three kinds. The shadcn registry's Tailwind tokens, custom properties and
 * `data-slot` values, which are read in six modules outside the vendored one
 * and are not ours to sweep (ADR 0047, ADR 0050). The two `.scratch/` efforts
 * `docs/agents/issue-tracker.md` names **without** their directory prefix,
 * which no path shape can see — the same blind spot that let two of them
 * through the sweep itself. And `CITED_PATH`, shared with the block above,
 * for every citation that does carry a prefix: a renamed citation into a tree
 * this rename does not rewrite is a broken link, which is the failure this
 * file's own comments record as having happened twice.
 */
const QUALIFIED_THING_SPELLINGS = [
  `text-${retiredThingLower}-foreground`,
  `--color-${retiredThingLower}-foreground`,
  `--${retiredThingLower}-foreground`,
  `--${retiredThingLower}-spacing`,
  `--color-${retiredThingLower}`,
  `data-slot="${retiredThingLower}`,
  // Tailwind's attribute-variant spelling of the same slot values.
  `[slot=${retiredThingLower}`,
  `bg-${retiredThingLower}`,
  `--${retiredThingLower}\``,
  `${retiredThingLower}-authoring`,
  `${retiredThingLower}-gestures`,
] as const;

const withoutQualifiedThingSpellings = (source: string): string =>
  QUALIFIED_THING_SPELLINGS.reduce(
    (text, spelling) => text.split(spelling).join('qualified'),
    source.replace(CITED_PATH, 'path'),
  );

/**
 * The six registry compounds the exemption below forgives. The registry's
 * seventh export is the bare word, which no compound arm reads and which the
 * bare arm forgives by file instead.
 */
const FOREIGN_THING_SPELLINGS = new RegExp(
  [
    `${RETIRED_THING}Action`,
    `${RETIRED_THING}Content`,
    `${RETIRED_THING}Description`,
    `${RETIRED_THING}Footer`,
    `${RETIRED_THING}Header`,
    `${RETIRED_THING}Title`,
    // Tailwind's group variant, which the collection-key arm reads as a key
    // because a slash is a word boundary where a hyphen is not.
    `/${retiredThingLower}:`,
    // The registry's own slot value, which the quoted-string arm reads.
    `data-slot="${retiredThingLower}"`,
    // A second registry component whose name ends in the retired word, written
    // only in the vendored guidance below.
    `Hover${RETIRED_THING}`,
  ].join('|'),
);

/**
 * An exempted file read with those six spellings masked out. Masking rather than
 * skipping is the point, and it matters more here than anywhere else in this
 * file: `packages/ui/src/index.ts` is a barrel exporting 25+ domain names, and a
 * whole-file exemption there would forgive the entire package surface to
 * accommodate seven vendored ones.
 */
const withoutForeignThingSpellings = (source: string): string =>
  source.replace(new RegExp(FOREIGN_THING_SPELLINGS.source, 'g'), 'foreign');

/**
 * The files where the retired spelling is the **shadcn registry's** rather than
 * ours: the vendored module, the barrel that re-exports it, the two components
 * and the two catalogue fixtures that render it, and the agent-facing document
 * that explains why the barrel now carries a domain content component and a
 * registry one under different names (ADR 0047, ADR 0050, ADR 0085).
 */
const FOREIGN_THING_FILES: readonly string[] = [
  // The vendored shadcn skill set, which `skills-lock.json` pins and which is
  // written in shadcn's own vocabulary: its composition rule *is* that you use
  // the registry's `Card` family rather than one `div`. Masked by spelling
  // rather than skipped as a tree, in the idiom the Diagram block above adopted
  // for the same tree — so a pinned-skills bump that introduced a domain
  // compound would still be reported. `shadcn-first-ui` and
  // `address-code-review` are repo-owned and are **not** here: the first names
  // our own components in its guidance and speaks the current vocabulary.
  '.agents/skills/shadcn/SKILL.md',
  '.agents/skills/shadcn/rules/composition.md',
  '.agents/skills/shadcn/rules/styling.md',
  '.agents/skills/shadcn/evals/evals.json',
  'packages/ui/src/components/card.tsx',
  'packages/ui/src/index.ts',
  'packages/ui/src/CanvasThing.tsx',
  'packages/ui/src/ThingRail.tsx',
  'packages/ui/test/design-system-baseline.test.tsx',
  'packages/app/stories/review/space-thing-canvas-prototype.stories.tsx',
  'docs/agents/ui.md',
];

/**
 * The implementation source that renders the registry's *bare* component, which
 * is spelled exactly as the domain type was. Narrower than the list above on
 * purpose: `ThingRail` takes only the header, and the two fixtures are not
 * implementation source, so neither reaches the bare arm at all.
 */
const FOREIGN_BARE_THING_FILES: readonly string[] = [
  'packages/ui/src/components/card.tsx',
  'packages/ui/src/index.ts',
  'packages/ui/src/CanvasThing.tsx',
];

/**
 * The callback binding, in the arm ADR 0041's Route block established and for
 * the reason its comment records: the convention is the domain initial
 * (`(t)` for thing, `(d)` for diagram, `(e)` for edge), so a binding introduced
 * over the Thing collection has exactly one correct letter and the retired
 * name's is not it. Twenty-five sites carried `(c)` over a Thing collection
 * through this rename and a text sweep could not see any of them, because
 * substituting the collection's own name leaves the callback's parameter
 * untouched — the same drift, in the same shape, that the Route arm was
 * written after.
 *
 * The collection has to be the **receiver**, with nothing between them, which is
 * what keeps a `count`, a `cell` or a `colour` bound by something this guard
 * does not govern out of it. Two live bindings are deliberately outside its
 * reach and should stay there: `elk-strategy.test.ts` binds `(c)` over elkjs's
 * own `children`, and a foreign collection has no domain initial to take.
 */
const RETIRED_THING_INITIAL_BINDING = new RegExp(
  [
    `\\.things\\s*\\.\\s*[A-Za-z]+\\s*\\(`,
    `\\s*(?:\\(\\s*${retiredThingLower[0] ?? ''}\\s*(?::[^)]*)?\\)|${retiredThingLower[0] ?? ''}\\b)\\s*=>`,
  ].join(''),
);

/**
 * Snapshots of a schema that really did carry the retired model. Excluded from
 * this block alone; see the block comment for why it is not a shared historical
 * tree.
 */
const MIGRATION_SNAPSHOTS = 'migrations/';

describe('a Thing is named once (ADR 0085)', () => {
  const scanned = scannableFiles().filter((file) => !file.startsWith(MIGRATION_SNAPSHOTS));

  it('reaches the kinds of file this rename actually touched', () => {
    // The domain schema, the authored database contract, and the agent-facing
    // document that describes the editing seam. A file list that quietly
    // stopped resolving would report nothing forever.
    expect(scanned).toContain('packages/core/src/schema.ts');
    expect(scanned).toContain('src/prisma/contract.prisma');
    expect(scanned).toContain('docs/agents/editing-and-persistence.md');
  });

  it('finds no compound of the retired name anywhere it still governs', () => {
    const found = scanned.flatMap((file) => {
      const source = readTracked(file);
      if (source === null) return [];
      const qualified = withoutQualifiedThingSpellings(source);
      const read = FOREIGN_THING_FILES.includes(file)
        ? withoutForeignThingSpellings(qualified)
        : qualified;
      return hits(read, RETIRED_THING_NAME).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('finds no bare retired name in implementation source', () => {
    const found = scanned
      .filter(isImplementationSource)
      .filter((file) => !FOREIGN_BARE_THING_FILES.includes(file))
      .flatMap((file) => {
        const source = readTracked(file);
        return source === null
          ? []
          : hits(source, RETIRED_THING_BARE).map((hit) => `${file}:${hit}`);
      });

    expect(found).toEqual([]);
  });

  it('finds no retired initial bound over a Thing collection', () => {
    const found = scanned.flatMap((file) => {
      const source = readTracked(file);
      return source === null
        ? []
        : spanningHits(source, RETIRED_THING_INITIAL_BINDING).map((hit) => `${file}:${hit}`);
    });

    expect(found).toEqual([]);
  });

  it('keeps no exemption that has stopped earning itself', () => {
    // Read against the spellings each was granted against: the day the registry
    // stops exporting one, or a consumer stops importing it, the exemption stops
    // being earned and goes.
    expectEachExemptionEarned(FOREIGN_THING_FILES, FOREIGN_THING_SPELLINGS);
    expectEachExemptionEarned(FOREIGN_BARE_THING_FILES, RETIRED_THING_BARE);

    // And the excluded tree is excluded because it still carries the record it
    // is excluded for, rather than out of habit.
    const snapshots = trackedFiles().filter((file) => file.startsWith(MIGRATION_SNAPSHOTS));
    expect(snapshots).not.toEqual([]);
    expect(
      snapshots.flatMap((file) => hits(readTracked(file) ?? '', RETIRED_THING_NAME)),
      'no migration snapshot still records the retired model',
    ).not.toEqual([]);
  });

  it('still reports a domain compound inside the registry exemption', () => {
    const source = [
      `import { ${RETIRED_THING}Header, ${RETIRED_THING}Title } from './components/${retiredThingLower}';`,
      `export { ${RETIRED_THING}Content } from './components/${retiredThingLower}';`,
      `const chosen = diagram.selected${RETIRED_THING};`,
    ].join('\n');

    expect(hits(withoutForeignThingSpellings(source), RETIRED_THING_NAME)).toEqual([
      `3: const chosen = diagram.selected${RETIRED_THING};`,
    ]);
  });

  it('reports the retired name in every shape it was written in', () => {
    // Composed rather than written out, in this file's usual idiom: spelled
    // literally, each fixture would be a hit this scan reports against its own
    // source.
    const retired = [
      `export type ${RETIRED_THING}Id = string;`,
      `import { parse${RETIRED_THING}File } from './${retiredThingLower}-file';`,
      `const canvas${RETIRED_THING} = space.${retiredThingLower}s[0];`,
      `const ${retiredThingLower}Kind = thing.kind;`,
      `const ${RETIRED_THING_UPPER}_ID = uuidSchema.parse('...');`,
      `const COLLAPSED_${RETIRED_THING_UPPER}_SIZE = 120;`,
      `{ "${retiredThingLower}s": [], "default${RETIRED_THING}": null }`,
      `model ${RETIRED_THING} { @@map("${retiredThingLower}s") }`,
      `for (const entry of space.${retiredThingLower}s) {`,
      // The kebab-case shapes, which are most of what this rename carried and
      // what every arm above reads straight past: refusal codes, completion
      // kinds, test ids, CSS blocks and `data-` attributes.
      `refusal.code = '${retiredThingLower}-not-found';`,
      `case 'edited-${retiredThingLower}':`,
      `<article data-testid="canvas-${retiredThingLower}">`,
      `.canvas-${retiredThingLower}__rail { display: flex; }`,
      `'space-${retiredThingLower}-target-missing',`,
      // The optional field, which the key arm cannot cross the `?` to reach.
      `readonly ${retiredThingLower}?: ${RETIRED_THING}Id;`,
      // The binding written as a whole parameter, with no capital to end it.
      `space.things.map((${retiredThingLower}) => ${retiredThingLower}.id)`,
      // ...and the three bindings a `)` terminator and an arrow could not
      // reach, which are the same drift in the same shape: a second parameter
      // after it, a `for...of` declaration, and a `function` expression.
      `space.things.map((${retiredThingLower}, index) => ${retiredThingLower}.id)`,
      `for (const ${retiredThingLower} of space.things) { use(${retiredThingLower}); }`,
      `space.things.forEach(function (${retiredThingLower}) { draw(${retiredThingLower}); })`,
    ];

    for (const line of retired) {
      expect(RETIRED_THING_NAME.test(line), line).toBe(true);
    }
  });

  it('reports the retired name standing alone', () => {
    for (const line of [
      `export type ${RETIRED_THING} = Thing;`,
      `import type { ${RETIRED_THING} } from '@project/core';`,
    ]) {
      expect(RETIRED_THING_BARE.test(line), line).toBe(true);
    }
  });

  it('reports the retired initial only where a Thing collection introduces it', () => {
    for (const line of [
      `space.things.map((${retiredThingLower[0] ?? ''}) => ${retiredThingLower[0] ?? ''}.id)`,
      `strategyGraph.things.map(${retiredThingLower[0] ?? ''} => ${retiredThingLower[0] ?? ''}.width)`,
      `laid.things.find((${retiredThingLower[0] ?? ''}: Thing) => true)`,
    ]) {
      expect(spanningHits(line, RETIRED_THING_INITIAL_BINDING), line).not.toEqual([]);
    }

    for (const line of [
      // The correct initial over the correct collection.
      'space.things.map((t) => t.id)',
      // The letter bound by something this guard does not govern.
      'children.map((c) => c.id)',
      'rows.flatMap((c) => c.cells)',
      // The collection named, but not as the receiver of the callback.
      'const ids = space.things; rows.map((c) => c.id)',
    ]) {
      expect(spanningHits(line, RETIRED_THING_INITIAL_BINDING), line).toEqual([]);
    }
  });

  it('stays silent on the registry, on ordinary English, and on the vocabulary that replaced it', () => {
    const kept = [
      // Ordinary English that merely contains the letters.
      `const ${retiredThingLower}inality = new Set(ids).size;`,
      `// the author dis${retiredThingLower}ed the draft rather than saving it`,
      `const pattern = 'wild${retiredThingLower}';`,
      // The same three English words in the two binding shapes the arms above
      // were widened to reach: both need the retired word whole, so a letter
      // either side of it is what keeps them out rather than an exemption.
      `for (const ${retiredThingLower}inality of counts) {`,
      `matches.map((wild${retiredThingLower}, index) => wild${retiredThingLower}.source)`,
      `rows.forEach(function (dis${retiredThingLower}ed) { drop(dis${retiredThingLower}ed); })`,
      // The vocabulary this rename arrived at.
      `const selectedThing = space.things.find((thing) => thing.id === id);`,
      `export type ThingId = z.infer<typeof uuidSchema>;`,
    ];

    for (const line of kept) {
      expect(RETIRED_THING_NAME.test(line), line).toBe(false);
    }

    // The registry's component names are forgiven by the exemption rather than
    // by the shape — the arms above read them exactly as they read a domain
    // compound, which is the whole reason this carve-out is by file.
    // The registry's hyphenated tokens and a citation into a tree this rename
    // does not rewrite: forgiven by the qualified masker, which runs before the
    // scan reads any file, rather than by the shape or by a file exemption.
    for (const line of [
      `'rounded-xl bg-${retiredThingLower} text-sm text-${retiredThingLower}-foreground'`,
      `  --color-${retiredThingLower}: var(--${retiredThingLower}-foreground);`,
      `  * see \`.scratch/${retiredThingLower}-route-editing/edge-authoring-design.md\``,
    ]) {
      expect(RETIRED_THING_NAME.test(line), line).toBe(true);
      expect(RETIRED_THING_NAME.test(withoutQualifiedThingSpellings(line)), line).toBe(false);
    }

    for (const line of [
      `import { ${RETIRED_THING}Header } from './components/${retiredThingLower}';`,
      `<${RETIRED_THING}Content className="canvas-thing__body">`,
      `<div data-slot="${retiredThingLower}" className="group/${retiredThingLower}" />`,
    ]) {
      expect(RETIRED_THING_NAME.test(line), line).toBe(true);
      expect(RETIRED_THING_NAME.test(withoutForeignThingSpellings(line)), line).toBe(false);
    }
  });
});
