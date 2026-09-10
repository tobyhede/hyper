#!/usr/bin/env node
/**
 * ADR 0085, change one of two: Layout becomes Diagram.
 *
 * Tracked so a branch that was in flight when this landed can replay it rather
 * than hand-merge it: rebase onto the commit before the rename, run this, commit.
 * That is the whole reason it exists as a file instead of a shell one-liner.
 *
 * It is deliberately NOT a blind substring sweep. `s/layout/diagram/g` produces
 * damage a reviewer will not catch by eye: "takes no layout space" becomes
 * "takes no diagram space", `useLayoutEffect` stops resolving, and
 * `LayoutStrategy` — which ADR 0085 records as a negative, in as many words —
 * loses the verb it is named for. So the protected spellings are masked first,
 * the general rule runs, and the masks come back.
 *
 * Usage:
 *   node .scratch/thing-and-diagram/rename-layout-to-diagram.mjs [--dry]
 *   pnpm exec prettier --write .
 *
 * The second line is not optional. The new noun is one character longer than
 * the old one, so ~20 files re-wrap and `format:check` is red without it.
 *
 * Two things in the rename commit are NOT produced here, because neither is a
 * spelling. A branch replaying this takes both from the merge like any other
 * edit:
 *   - the product URL segment `/views/` → `/diagrams/` (ADR 0069, ADR 0085 —
 *     `views` was a third word for the entity, left behind when ADR 0079
 *     retired the View);
 *   - this rename's guard block in `test/unit/current-domain-vocabulary.test.ts`.
 *
 * And what it must never open is as load-bearing as what it must not rewrite:
 * see `EXCLUDED_PATHS`. The first version of this script had a protected-spelling
 * list built from application source and a filter set to every tracked file, and
 * it renamed a real npm package out of the lockfile — invisible locally, because
 * `node_modules` already held the right name, and fatal on CI's clean install.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry');

/**
 * Accepted ADRs and resolved issue records say what the design used to be, so
 * they have to keep saying it. The same three trees the vocabulary guard
 * excludes, for the same reason.
 */
const HISTORICAL = ['docs/adr/', 'docs/superpowers/', '.scratch/'];

/**
 * Files this sweep must not open at all, as opposed to spellings it must not
 * change. The distinction matters: a protected spelling still requires someone
 * to have thought of it, and the first version of this script was written by
 * reading application source while its filter was every tracked file. Everything
 * it damaged lived in that gap.
 *
 *  - `pnpm-lock.yaml` names third-party packages, one of which is genuinely
 *    called `@radix-ui/react-use-layout-effect`. Rewriting it left the real
 *    integrity hashes under a package name that 404s, which every local check
 *    is blind to because `node_modules` already holds the real one — it only
 *    fails on a clean `--frozen-lockfile` install, i.e. in CI.
 *  - `.agents/skills/` is vendored third-party guidance pinned by
 *    `skills-lock.json`, and it is guidance about CSS layout. Sweeping it both
 *    corrupted the advice and made the lock record a provenance that is a lie.
 */
const EXCLUDED_PATHS = ['pnpm-lock.yaml', 'skills-lock.json', '.agents/skills/'];

/**
 * Spellings where "layout" is not the entity.
 *
 * Three kinds, and they are three different arguments:
 *  - foreign names that arrive with a library and are not ours to sweep
 *    (React's hook, Lucide's glyph, elkjs's options bag);
 *  - `LayoutStrategy` and everything built on it, where the word is the verb —
 *    two of its three implementations read no Diagram at all (ADR 0014, 0085);
 *  - ordinary prose about arranging things on a screen, which survives the
 *    entity releasing the noun.
 *
 * Ordered longest-first within each kind so a longer protected spelling wins
 * over a shorter one that is a prefix of it.
 */
const PROTECTED = [
  // Foreign names.
  'DEFAULT_ELK_LAYOUT_OPTIONS',
  'useLayoutEffect',
  'LayoutOptions',
  'layoutOptions',
  'LayoutGrid',
  // Lucide's own kebab glyph names, as the facade's test and the icon-review
  // story spell them. These name a shape in someone else's catalogue.
  'layout-grid',
  'layout-dashboard',
  // React Flow's own docs path, cited in docs/agents/rendering.md.
  '/learn/layouting/',
  // elkjs's own engine method, the slice `ElkEngine` declares, and the prose
  // about it. `layout` here is the call ELK exposes, not our entity.
  'layout: (graph: ElkGraphNode)',
  '.layout(elkGraph)',
  'layout: (g) =>',
  'later layout',
  // The verb, as a contract name.
  'LayoutStrategy',
  'layoutStrategy',
  'layout-strategy',
  'layout strategies',
  'Layout strategies',
  'layout strategy',
  'Layout strategy',
  // The verb, in prose and in CSS-shaped names.
  'GROUP_LAYOUT',
  'layout space',
  'flex layout',
  'graph-layout',
  'graph layout',
  'layout means',
  'layout engine',
  // The two modules that keep their filenames because the word in them is the
  // verb: packages/graph/src/layout.ts and react-flow-adapter/src/elk/layout.ts.
  "from './layout'",
  "from '../layout'",
  "from './elk/layout'",
  "from '../src/layout'",
  'graph/src/layout.ts',
  'graph/test/layout.test.ts',
  'elk/layout.ts',
  // The short form a document used for the same kept module.
  'graph/layout.ts',
  // React Flow's own docs paths. `/learn/layouting/` is above; the examples
  // category is a second one, cited from the README.
  '/examples/layout/',

  // --- Paths into the trees this sweep deliberately does not rewrite. ---
  // HISTORICAL excludes the *contents* of those trees. It does nothing for a
  // current-state document that CITES one, and a renamed citation is a dangling
  // pointer — the failure this repository's own guard comments record as having
  // already happened twice.
  // Bare, so every citation form is covered: with and without the `.scratch/`
  // prefix, and the shorthand `<feature>/<NN>` the roadmap generator parses.
  'layout-seam',
  'layout-only-v1',
  '0014-layout-is-the-authored-data-strategy-is-the-behaviour',
  '0040-layouts-own-card-membership-and-routes',
  '0079-v1-exposes-only-layouts-and-first-open-initializes-one',
  '0026-a-route-is-active-and-the-layout-may-name-it',
  '0045-a-view-takes-cards-and-graphs-and-returns-a-layout',
  '0002-layout-and-view-are-separate-entities',
  'ADR-0002 (layout/view separation)',

  'layout-ownership-review',

  // --- The verb, in the ordinary English the mask list first read past. ---
  // Every one of these is about the behaviour that placed something, or about
  // a CSS box. They survived the first sweep because a protected *identifier*
  // still leaves the word loose in the sentence beside it, which is how "takes
  // no layout space" and "a layout effect" came through as the entity.
  'layout resolves',
  'layout effect',
  'layout box',
  'layout seam',
  'layout constraint',
  'layout classes',
  'layout pass',
  'ELK layout',
  'browser layout',
  're-run layout',
  're-runs layout',
  're-layout',
  // The verb, in the shapes a replay-fidelity check against the rename commit
  // turned up. Each is prose about arranging or resolving a screen, a CSS class,
  // or a path into a tree this sweep does not rewrite.
  'layout resolves',
  're-run layout',
  're-runs layout',
  'layout constraint',
  'layout seam',
  'layout classes',
  'caller-layout',
  'layout or interaction',
  'layout needs',
  'layout and which arrow',
  'layout of its own',
  'layout behavior',
  "collection's layout",
  "catalogue's layout",
  "Title's layout",
  'layout-ownership-review',
  '0002-layout-view-separation',
  '0005-layout-is-a-strategy',
  'caller-layout',
  'caller layout',
  'no layout of its own',
  'no layout or interaction geometry',
  "collection's layout",
  "catalogue's layout",
  "Title's layout",
  'the layout and which arrow keys',
  'the word *layout*',
  'strict layout',
  'layout and the stylesheet',

  // The two ADR filenames the doc tree in docs/agents/domain.md draws, which
  // are the tracked spellings and not the titles the ADRs were renamed to.
  '0002-layout-view-separation.md',
  '0005-layout-is-a-strategy.md',
  // The kept basename, wherever a test or a document names it bare.
  'layout.ts',

  // --- Current-state documents that deliberately SAY the retired word. ---
  // A glossary entry that retires a noun has to spell the noun; so does the
  // AGENTS.md entry naming the change, and the guard's own rationale, which
  // quotes the senses it stays silent on.
  'Card and Layout',
  // The change's own name, this script's own filename, and the record of a
  // module rename — all three are AGENTS.md describing this very sweep.
  'Layout is Diagram',
  'rename-layout-to-diagram',
  '`layout-resolution.ts`',
  '_Avoid_: Layout',
  'layouting page',
  'CSS layout',
  '`Layout`',
  ", 'Layout`'",
  "'Layout` \u2192 `elkStrategy'",
  '* Layout, and states',

  // --- Historical records: names that only ever existed in the old spelling. ---
  // Renaming these does not update a record, it falsifies one.
  '`defaultView` → `defaultLayout`',
  'elkLayout',
  // Backticked, because these are quoted as retired names in a document. The
  // bare spellings are live vocabulary in a guard fixture and must still move.
  '`layout-header`',
  '`data-layout-id`',
  // A resolved issue record's filename, which carries the word twice.
  'default-layout-options',

  // --- The verb, in prose the first pass did not reach. ---
  // Each of these is about arranging things on a screen, or about a filesystem,
  // and survives the entity releasing the noun.
  '"layout" means',
  'Package layout',
  'strict layout',
  'layout options',
  'layout fixture',
  'layout pass',
  'layout effect',
  'visual treatment, layout',
  'the layout and the stylesheet',
  'spatial layout',
  're-layout',
  'react-use-layout-effect',
];

/**
 * Prose where "layout" is the verb and the sentence is about the behaviour that
 * placed something. These read as the entity after a substitution and as
 * nothing at all after a mask, so they are rewritten to name the behaviour —
 * `LayoutStrategy` is what every one of them means. Applied before the general
 * rule, longest first.
 */
const VERB_PHRASES = [
  ['once a routing layout has placed it', 'once a routing strategy has placed it'],
  ['Not every layout places ports', 'Not every strategy places ports'],
  ['When a layout places no routing', 'When a strategy places no routing'],
  ['the layout placed them at', 'the strategy placed them at'],
  ['once a layout has placed it', 'once a strategy has placed it'],
  ['a layout has placed them', 'a strategy has placed them'],
  ['no layout has placed yet', 'no strategy has placed yet'],
  ['the layout has not placed', 'the strategy has not placed'],
  ['the layout has placed', 'the strategy has placed'],
  ['a routing layout runs', 'a routing strategy runs'],
  ['The size a layout arranges cards at', 'The size a strategy arranges cards at'],
  ['The layout arranges cards at', 'The strategy arranges cards at'],
  ['looking like a layout bug', 'looking like a strategy bug'],
  // The repo's callback-binding convention, which is the domain initial. The
  // entity's initial changes with the entity, and the comment that documents
  // the convention is read by the guard that enforces it.
  ['`(l)` for layout', '`(d)` for diagram'],
  // The duplicate point type ADR 0038 collapsed only ever existed under the old
  // spelling, so renaming it would falsify a record — but naming it at all
  // costs the guard an exemption for a word nothing else writes. Both sentences
  // recall the fact without spelling the name.
  ['the duplicate `LayoutPoint` is gone', 'the duplicate point type ADR 0038 collapsed is gone'],
  [
    'collapsing the duplicate `LayoutPoint` bought',
    'collapsing the duplicate point type ADR 0038 named bought',
  ],
  // A local naming what a strategy computed for one card, not a Diagram. It
  // reads as the entity under either spelling, so it takes a third name.
  ['cardLayout', 'placedCard'],
];

/** Applied after masking, longest key first. */
const RENAMES = [
  ['layoutless', 'diagramless'],
  ['Layoutless', 'Diagramless'],
  ['LAYOUT', 'DIAGRAM'],
  ['Layout', 'Diagram'],
  ['layout', 'diagram'],
];

/**
 * A sentinel no source in this repository contains. Spelled without control
 * characters so a masked intermediate stays greppable if this script is ever
 * stopped half way through a file.
 */
const mask = (index) => `@@PROTECTED_${index}@@`;

const rewrite = (text) => {
  let masked = text;
  for (const [from, to] of VERB_PHRASES) masked = masked.split(from).join(to);
  PROTECTED.forEach((token, index) => {
    masked = masked.split(token).join(mask(index));
  });
  for (const [from, to] of RENAMES) masked = masked.split(from).join(to);
  PROTECTED.forEach((token, index) => {
    masked = masked.split(mask(index)).join(token);
  });
  return masked;
};

const NUL = String.fromCharCode(0);

/**
 * Regular blobs only. `.claude/skills/` holds tracked symlinks to directories
 * (the skills are tracked for both harnesses), and `CLAUDE.md` is a symlink to
 * `AGENTS.md` — rewriting through either would either fail or write the same
 * file twice.
 */
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

const tracked = execFileSync('git', ['ls-files', '--stage', '-z'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split(NUL)
  .flatMap((entry) => {
    const separator = entry.indexOf('\t');
    if (separator === -1) return [];
    const file = entry.slice(separator + 1);
    if (!REGULAR_FILE_MODES.has(entry.slice(0, 6))) return [];
    if (EXCLUDED_PATHS.some((path) => file === path || file.startsWith(path))) return [];
    return HISTORICAL.some((tree) => file.startsWith(tree)) ? [] : [file];
  });

const BINARY = /\.(png|jpg|jpeg|gif|ico|woff2?|pdf)$/i;

let changedFiles = 0;
for (const file of tracked) {
  if (BINARY.test(file)) continue;
  const absolute = join(repoRoot, file);
  if (!existsSync(absolute)) continue;
  const before = readFileSync(absolute, 'utf8');
  if (!/layout/i.test(before)) continue;
  const after = rewrite(before);
  if (after === before) continue;
  changedFiles += 1;
  if (!dryRun) writeFileSync(absolute, after);
}

/**
 * The three modules above keep their basenames; every other layout-named path
 * follows the vocabulary.
 */
const KEEP_FILENAME = [
  'packages/graph/src/layout.ts',
  'packages/graph/test/layout.test.ts',
  'packages/react-flow-adapter/src/elk/layout.ts',
];

let renamedPaths = 0;
for (const file of tracked) {
  if (KEEP_FILENAME.includes(file)) continue;
  const name = basename(file);
  if (!/layout/i.test(name)) continue;
  const renamed = name.replace(/layout/g, 'diagram').replace(/Layout/g, 'Diagram');
  if (renamed === name) continue;
  renamedPaths += 1;
  if (!dryRun) execFileSync('git', ['mv', file, join(dirname(file), renamed)], { cwd: repoRoot });
}

console.log(`${dryRun ? 'would rewrite' : 'rewrote'} ${changedFiles} files`);
console.log(`${dryRun ? 'would rename' : 'renamed'} ${renamedPaths} paths`);
