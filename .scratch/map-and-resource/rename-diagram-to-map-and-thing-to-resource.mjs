#!/usr/bin/env node
/**
 * ADR 0101: Diagram becomes Map and Thing becomes Resource, in one change.
 *
 * The successor to `.scratch/thing-and-diagram/rename-layout-to-diagram.mjs`
 * and `rename-card-to-thing.mjs`. Read the first of those for the mask /
 * rewrite / unmask design and the two failures that shaped it; neither is
 * repeated here. What follows is only what is different about these two words.
 *
 * Usage:
 *   node .scratch/map-and-resource/rename-diagram-to-map-and-thing-to-resource.mjs [--dry]
 *   pnpm exec prettier --write .
 *
 * The second line is not optional, for the same reason as both predecessors:
 * both nouns change length, so lines re-wrap and `format:check` is red without
 * it.
 *
 * **One script for two words, which the two predecessors were not.** ADR 0085
 * ran Layout and Card as separate sweeps and paid for every step twice — two
 * mask tables, two prettier runs, two path passes, two reviews and, worst, two
 * replays onto every branch in flight. The two words here are independent and
 * checked to be: "Map" contains no `thing`, "Resource" contains no `diagram`,
 * and the one live compound of both, `space-thing-diagram` (60 sites), rewrites
 * correctly whichever order the substitutions run in.
 *
 * Things in the rename commit this does NOT produce, because none of them is a
 * spelling. A branch replaying this takes them from the merge:
 *   - the `(d) =>` and `(t) =>` callback bindings over Map and Resource
 *     collections, which become `(m)` and `(r)`. The domain initial is a
 *     convention, not a spelling of the word, and the same argument kept these
 *     out of both predecessors.
 *   - sorted-assertion reorder. A renamed directory or Title moves a row in a
 *     globally sorted expectation, which no text substitution can see and only
 *     a red test finds. Both predecessors hit this; the second had to write
 *     `fixup-sort-order.mjs` to reproduce a fix the first had already made.
 *   - AGENTS.md's and CONTEXT.md's sentences that name what ADR 0085 decided,
 *     which would sweep into nonsense ("Map and Resource are the first-public
 *     names for Map and Resource").
 *   - this rename's guard block in `test/unit/current-domain-vocabulary.test.ts`.
 *   - the four type-position `Map<…>` annotations ADR 0101 measures, in
 *     `render-adapter.ts` (2), `canvas-thing-authoring.ts` and `edge-lanes.ts`.
 *   - the two database migrations.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry');
const verbose = process.argv.includes('--verbose');

/** The same three trees the vocabulary guard excludes, for the same reason. */
const HISTORICAL = ['docs/adr/', 'docs/superpowers/', '.scratch/'];

/**
 * Files this sweep must not open at all, as opposed to spellings it must not
 * change.
 *
 * `pnpm-lock.yaml` has zero hits for either word today and stays on principle:
 * a local check is blind to lockfile damage, and only a clean
 * `--frozen-lockfile` install is not. The first version of the Layout script
 * renamed a real npm package out of it, invisible locally because
 * `node_modules` already held the right name.
 *
 * **Both migration trees, for the reason the Card sweep learned once.** ADR
 * 0056 makes migration snapshots history; a swept snapshot passes against an
 * already-migrated local database and fails against a fresh one, which nothing
 * in `verify`, `e2e` or `e2e:ladle` can observe. `migrations-sqlite/` is the
 * entry the Card sweep had no need for — SQLite arrived after it — and it is
 * the one a reader working from that script will leave out.
 *
 * `.agents/skills/shadcn/` is vendored and pinned by `skills-lock.json`;
 * `shadcn-first-ui/` beside it is repo-owned, names our own components, and
 * **sweeps**. Freezing it would leave a skill instructing the next agent to
 * compose a `CanvasThing` that no longer exists.
 */
const EXCLUDED_PATHS = [
  'pnpm-lock.yaml',
  'skills-lock.json',
  '.agents/skills/shadcn/',
  'migrations/',
  'migrations-sqlite/',
];

/**
 * Applied before the sweep, and the only place this script renames something
 * that is not one of the two words.
 *
 * `SpaceResourceRepository` uses Resource in the HTTP sense for the stored
 * seam. After the sweep it would read as "a repository of Space Resources",
 * which is a real entity in the new vocabulary and not what the type is. It
 * takes the name `AGENTS.md` already uses for it in prose — "the **stored**
 * side of the seam". Its two siblings are local type aliases in one HTTP test
 * and name Hono route types, so they say endpoint.
 *
 * `graphColorMap` gives up the `…Map` suffix, which ADR 0101 reserves for the
 * entity. It returns a `Record` keyed by Graph id and says so.
 *
 * Ordered longest-first so a longer key wins over a shorter one that is a
 * prefix of it.
 */
const PRE_REWRITES = [
  ['SpaceResourceRepository', 'StoredSpaceRepository'],
  ['spaceResourceRepository', 'storedSpaceRepository'],
  ['AggregateResource', 'AggregateEndpoint'],
  ['SpaceResource', 'SpaceEndpoint'],
  ['graphColorMap', 'graphColorsByGraphId'],
];

/**
 * Spellings where the retired word is not the entity, in every file.
 *
 * For `thing` this is the whole English cost of ADR 0085's noun, and the list
 * is complete rather than representative: a scan of every all-lowercase token
 * containing `thing` across the sweepable trees returns exactly these four
 * stems. They matter because this script substitutes plain substrings, as both
 * predecessors do — `nothing` would otherwise become `noresource` on 1,452
 * lines.
 *
 * For `diagram` there is nothing to protect. The same scan returns one token,
 * `ndiagram`, which is `\ndiagram:` inside a frontmatter template literal and
 * is the entity, correctly becoming `\nmap:`.
 *
 * Ordered longest-first within each case so a longer protected spelling wins.
 */
const PROTECTED = [
  'EVERYTHING',
  'SOMETHING',
  'ANYTHING',
  'NOTHING',
  'Everything',
  'Something',
  'Anything',
  'Nothing',
  'everything',
  'something',
  'anything',
  'nothing',
];

/**
 * Citations into the trees this sweep does not rewrite.
 *
 * `HISTORICAL` excludes the *contents* of those trees and does nothing for a
 * current-state document that cites one — and a renamed citation is a dangling
 * pointer, which this repository has now done three times.
 *
 * Only the citation *shape* is forgiven: a path under `.scratch/`, or an ADR
 * slug, which is the one thing here that opens with four digits and a hyphen.
 * Masking bare tokens is not available, because `.scratch/` feature names
 * collide with live file stems — `thing-and-diagram` names both the effort that
 * did the last rename and nothing else, but `space-thing-*` names live modules.
 *
 * **This shape misses a citation written without its prefix**, which is how two
 * escaped the Card sweep (`space-cards/04` in `docs/agents/ui.md`, and seven in
 * `docs/agents/issue-tracker.md`). `--verbose` reports every bare `<feature>/NN`
 * token it rewrote so the check is mechanical rather than remembered.
 */
const PROTECTED_PATTERNS = [/\.scratch\/[A-Za-z0-9._/-]+/g, /\b\d{4}-[a-z0-9-]+/g];

/** Applied after masking, longest key first, both words in one pass. */
const RENAMES = [
  ['DIAGRAMS', 'MAPS'],
  ['Diagrams', 'Maps'],
  ['diagrams', 'maps'],
  ['DIAGRAM', 'MAP'],
  ['Diagram', 'Map'],
  ['diagram', 'map'],
  ['THINGS', 'RESOURCES'],
  ['Things', 'Resources'],
  ['things', 'resources'],
  ['THING', 'RESOURCE'],
  ['Thing', 'Resource'],
  ['thing', 'resource'],
];

/** Reported, not rewritten: the bare `<feature>/NN` citation shape. */
const BARE_CITATION = /\b[a-z][a-z0-9-]*\/\d{2}\b/g;

/**
 * Reported, not rewritten: a bare lowercase retired noun in prose.
 *
 * This is the category no mask table can reach, and it is ADR 0085's ticket 01
 * inverted. That ticket substituted generic English *thing* for *entity* so the
 * incoming domain noun would not land beside the word it had taken. The risk
 * now runs the other way: the sweep turns a genuine English "the same thing"
 * into "the same resource", which is not a collision but simply wrong text, and
 * it is invisible in a 488-file diff.
 *
 * A determiner is the tell. The domain noun in prose is capitalised here by
 * convention — "a Thing", "every Thing" — so a *lowercase* noun behind an
 * English determiner is either ordinary English or a sentence that already
 * failed the convention. Both want a human. This over-reports on purpose: a
 * list to read is the cheap half, and the expensive half is not having one.
 */
const DETERMINER =
  '(?:same|a|an|one|the only|any|every|each|first|last|real|main|right|whole|another|no|two|three|several|such a|this|that|which|other|next|sort of|kind of)';
const PROSE_NOUN = new RegExp(`\\b${DETERMINER} (?:things?|diagrams?)\\b`, 'gi');
const PROSE_LINE = /^\s*(\*|\/\/|-|#|>|$|[A-Z`])/;

/**
 * A sentinel no source in this repository contains. Spelled without control
 * characters so a masked intermediate stays greppable if this script is ever
 * stopped part way through a file.
 */
const mask = (index) => `@@PROTECTED_${index}@@`;

const rewrite = (text) => {
  let masked = text;
  for (const [from, to] of PRE_REWRITES) masked = masked.split(from).join(to);

  PROTECTED.forEach((token, index) => {
    masked = masked.split(token).join(mask(index));
  });

  // Pattern masks are captured rather than listed, so each match unmasks to
  // exactly the text it replaced.
  const captured = [];
  for (const pattern of PROTECTED_PATTERNS) {
    masked = masked.replace(new RegExp(pattern.source, 'g'), (match) => {
      captured.push(match);
      return mask(`P${captured.length - 1}`);
    });
  }

  for (const [from, to] of RENAMES) masked = masked.split(from).join(to);

  captured.forEach((match, index) => {
    masked = masked.split(mask(`P${index}`)).join(match);
  });
  PROTECTED.forEach((token, index) => {
    masked = masked.split(mask(index)).join(token);
  });
  return masked;
};

/**
 * `--preview <path>` writes one file's rewritten form beside the script and
 * prints nothing else, so the result can be read with `diff` before any sweep
 * is trusted. A `--dry` that reports a count says the mask table and the tree
 * agree; it does not say the output is right.
 */
const previewIndex = process.argv.indexOf('--preview');
if (previewIndex !== -1) {
  const target = process.argv[previewIndex + 1];
  const source = readFileSync(join(repoRoot, target), 'utf8');
  const destination = join(dirname(process.argv[1]), 'preview.out');
  writeFileSync(destination, rewrite(source));
  console.log(destination);
  process.exit(0);
}

const NUL = String.fromCharCode(0);

/**
 * Regular blobs only. `.claude/skills/` holds tracked symlinks to directories
 * and `CLAUDE.md` is a symlink to `AGENTS.md` — rewriting through either would
 * either fail or write the same file twice.
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
const RETIRED = /diagram|thing/i;

let changedFiles = 0;
const citations = new Map();
const prose = [];
for (const file of tracked) {
  if (BINARY.test(file)) continue;
  const absolute = join(repoRoot, file);
  if (!existsSync(absolute)) continue;
  const before = readFileSync(absolute, 'utf8');
  if (!RETIRED.test(before)) continue;
  const after = rewrite(before);
  if (after === before) continue;

  // Every bare `<feature>/NN` the rewrite touched, for the manual citation read
  // the shape mask cannot do for us.
  for (const citation of before.match(BARE_CITATION) ?? []) {
    if (!RETIRED.test(citation)) continue;
    citations.set(citation, (citations.get(citation) ?? 0) + 1);
  }

  // Every lowercase retired noun behind an English determiner, in prose, with
  // its line, so the preparatory read is generated rather than grepped.
  const markdown = file.endsWith('.md');
  before.split('\n').forEach((line, index) => {
    if (!markdown && !PROSE_LINE.test(line)) return;
    for (const match of line.match(PROSE_NOUN) ?? []) {
      if (/[A-Z]/.test(match.split(' ').at(-1) ?? '')) continue;
      prose.push(`${file}:${index + 1}  ${match}  —  ${line.trim().slice(0, 96)}`);
    }
  });

  changedFiles += 1;
  if (!dryRun) writeFileSync(absolute, after);
}

/**
 * Every path named for either word follows the vocabulary. There is no kept
 * basename: the argument that saved `layout.ts` for the Layout sweep was that
 * the word in it is the verb, and neither of these words has a verb sense in a
 * filename here. `packages/graph/src/layout.ts` is untouched because it
 * contains neither word.
 */
const renamePath = (path) =>
  path
    .split('/')
    .map((segment) =>
      segment
        .replace(/diagrams/g, 'maps')
        .replace(/Diagrams/g, 'Maps')
        .replace(/diagram/g, 'map')
        .replace(/Diagram/g, 'Map')
        .replace(/things/g, 'resources')
        .replace(/Things/g, 'Resources')
        .replace(/thing/g, 'resource')
        .replace(/Thing/g, 'Resource'),
    )
    .join('/');

let renamedPaths = 0;
const paths = [];
for (const file of tracked) {
  if (!RETIRED.test(file)) continue;
  const renamed = renamePath(file);
  if (renamed === file) continue;
  renamedPaths += 1;
  paths.push(`${file} -> ${renamed}`);
  if (dryRun) continue;
  // A directory is renamed by renaming the files inside it, and `git mv` will
  // not create the destination.
  mkdirSync(join(repoRoot, dirname(renamed)), { recursive: true });
  execFileSync('git', ['mv', file, renamed], { cwd: repoRoot });
}

console.log(`${dryRun ? 'would rewrite' : 'rewrote'} ${changedFiles} files`);
console.log(`${dryRun ? 'would rename' : 'renamed'} ${renamedPaths} paths`);
if (citations.size > 0) {
  console.log(`\n${citations.size} bare '<feature>/NN' citations were rewritten — read each:`);
  for (const [citation, count] of [...citations].sort()) console.log(`  ${citation} (${count})`);
}
if (prose.length > 0) {
  console.log(`\n${prose.length} lowercase retired nouns in prose — read each before sweeping:`);
  for (const line of prose) console.log(`  ${line}`);
}
if (verbose) {
  console.log('\npaths:');
  for (const path of paths) console.log(`  ${path}`);
}
