#!/usr/bin/env node
/**
 * ADR 0085, change two of two: Card becomes Thing.
 *
 * The sibling of `rename-layout-to-diagram.mjs`, and tracked for the same
 * reason: a branch that was in flight when this landed replays it rather than
 * hand-merging ~410 files. Read that script's header first — the mask / rewrite
 * / unmask design and the two failures that shaped it are recorded there and
 * are not repeated here. What follows is only what is different about this word.
 *
 * Usage:
 *   node .scratch/thing-and-diagram/rename-card-to-thing.mjs [--dry]
 *   pnpm exec prettier --write .
 *
 * The second line is not optional, for the same reason: the new noun is one
 * character shorter, so lines re-wrap and `format:check` is red without it.
 *
 * Four things in the rename commit are NOT produced here, because none of them
 * is a spelling. A branch replaying this takes all four from the merge:
 *   - the 27 `(c) =>` callback bindings over Thing collections. `(c)` is the
 *     repo's domain-initial convention, not a spelling of the word, and the
 *     same argument kept `/views/` → `/diagrams/` out of the change-one script.
 *   - AGENTS.md's ADR 0085 entry, which says "Card is still Card" and would be
 *     swept into nonsense.
 *   - the prose in `scripts/ui-catalog.ts`, `test/unit/ui-catalog.test.ts` and
 *     `docs/agents/ui.md` explaining the `CardContent as CardSection` alias,
 *     which this change deletes, so the example those sentences use is gone.
 *   - this rename's guard block in `test/unit/current-domain-vocabulary.test.ts`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry');

/** The same three trees the vocabulary guard excludes, for the same reason. */
const HISTORICAL = ['docs/adr/', 'docs/superpowers/', '.scratch/'];

/**
 * Files this sweep must not open at all, as opposed to spellings it must not
 * change.
 *
 * The first three are change one's list and its arguments carry over unchanged.
 * `pnpm-lock.yaml` has zero `card` hits today, so it is here on principle
 * rather than as a live hazard — the reason it stays is that a local check is
 * blind to lockfile damage and only a clean `--frozen-lockfile` install is not.
 *
 * **`migrations/` is the entry change one had no need for, and it is the one
 * that matters.** Layout was never a table. Card is: 40 files and ~344
 * occurrences of `table: 'cards'`, `cards_space_id_idx`, `cards_space_id_fkey`
 * and the `start-contract` / `end-contract` snapshots. ADR 0085 says migration
 * snapshots are history and are not rewritten, and the failure shape is exactly
 * the lockfile's — a swept snapshot passes against an already-migrated local
 * database and fails against a fresh one, which nothing in `verify`, `e2e` or
 * `e2e:ladle` can observe. The model rename is one authored forward migration
 * instead (`.scratch/thing-and-diagram/issues/03-...`).
 *
 * `packages/ui/src/components/card.tsx` is the vendored shadcn registry module.
 * ADR 0085: its seven exports, its Tailwind tokens and its `data-slot` values
 * are not ours to sweep. Excluding the file is only half of that — the names it
 * exports are used in five other modules, and those are masked per file below.
 */
const EXCLUDED_PATHS = [
  'pnpm-lock.yaml',
  'skills-lock.json',
  // Only the tree `skills-lock.json` actually pins. Change one excluded
  // `.agents/skills/` whole, and for Layout that was harmless; here it would
  // have frozen `shadcn-first-ui`, which is **repo-owned**, unlocked, and names
  // our own components in its guidance — a skill telling the next agent to
  // compose a `CanvasCard` when the component is `CanvasThing` is worse than
  // stale, it is wrong instruction.
  '.agents/skills/shadcn/',
  'migrations/',
  'packages/ui/src/components/card.tsx',
];

/**
 * Applied before anything else, and the one place this sweep edits the
 * carve-out's neighbourhood rather than skipping it.
 *
 * `packages/ui/src/index.ts` re-exports the registry's `CardContent` under a
 * second name for exactly one reason: the domain `packages/ui/src/CardContent.tsx`
 * occupies the real one. Once the domain module is `ThingContent`, the reason is
 * gone — so the alias is deleted here rather than swept into `ThingSection`,
 * which would preserve a workaround for a collision that no longer exists
 * (ADR 0085 says this in as many words).
 */
const PRE_REWRITES = [
  ['CardContent as CardSection', 'CardContent'],
  ['CardSection', 'CardContent'],
];

/**
 * Spellings where "card" is not the entity, in every file.
 *
 * Two kinds, and they are two different arguments:
 *  - ordinary English words that merely contain the letters. `cardinality` is
 *    the one that needs saying: it opens on a word boundary, so no `\bcard`
 *    rule would have saved it, and it is the same shape `LayoutStrategy` was
 *    for change one. `discard` and `wildcard` are caught by the boundary, but
 *    this script substitutes plain substrings rather than boundaried ones —
 *    that is what change one does — so they are listed too.
 *  - the shadcn registry's Tailwind tokens and CSS custom properties, which are
 *    read far outside the registry module: `bg-card` in a Dock control and a
 *    Graph HUD, `var(--card)` in four stylesheets. Vendored vocabulary
 *    (ADR 0047, ADR 0050).
 *
 * Ordered longest-first within each kind so a longer protected spelling wins
 * over a shorter one that is a prefix of it. Note what is deliberately absent:
 * `--card-hover-duration` and `--card-hover-easing` are **ours**, not the
 * registry's, and they sweep. `var(--card)` cannot match inside them because it
 * requires the closing paren.
 */
const PROTECTED = [
  // Ordinary English.
  'cardinality',
  'Cardinality',
  'discard',
  'Discard',
  'wildcard',
  'Wildcard',

  // The registry's Tailwind tokens and custom properties.
  '--color-card-foreground',
  '--card-foreground',
  'text-card-foreground',
  '--color-card',
  '--card-spacing',
  'var(--card)',
  '--card: #fbfbfa',
  '`--card`',
  'bg-card',

  // The glossary entry that retires the noun has to spell the noun.
  'Card (retired by ADR 0085)',
];

/**
 * Citations into the trees this sweep does not rewrite.
 *
 * `HISTORICAL` excludes the *contents* of those trees and does nothing for a
 * current-state document that cites one — and a renamed citation is a dangling
 * pointer, the failure this repository's guard comments record as having
 * already happened twice.
 *
 * Regexes rather than the literal list change one used, because Card's
 * citations collide with live names in a way Layout's did not: `card-authoring`
 * is both a `.scratch/` feature directory and the stem of a live test file, so
 * masking the bare token would freeze the file that must move. Only the
 * citation *shape* is forgiven — a path under `.scratch/`, or an ADR slug,
 * which is the one thing in this repository that opens with four digits and a
 * hyphen.
 */
const PROTECTED_PATTERNS = [/\.scratch\/[A-Za-z0-9._/-]+/g, /\b\d{4}-[a-z0-9-]+/g];

/**
 * Spellings protected only inside one file.
 *
 * The registry exports five names that a domain name is spelled identically to
 * — `Card` is the domain type in `@project/core`, `CardContent` is a domain
 * component with its own module — so a global mask would freeze the half that
 * has to move. Each entry below is a registry usage at a site that also carries
 * domain vocabulary in the same file, and each is written in the exact shape it
 * appears in: an import specifier, a closing tag, or an opening tag with the
 * character that follows it, which is what separates `<Card` from `<CardRail`
 * and `<CardContent className=` (the registry's, in `CanvasCard`) from
 * `<CardContent title=` (the domain's, in `CardNode`).
 */
const FILE_PROTECTED = {
  'packages/ui/src/index.ts': [
    [
      'export {',
      '  Card,',
      '  CardAction,',
      '  CardContent,',
      '  CardDescription,',
      '  CardFooter,',
      '  CardHeader,',
      '  CardTitle,',
      "} from './components/card';",
    ].join('\n'),
  ],
  'packages/ui/src/CanvasCard.tsx': [
    "import { Card, CardContent, CardTitle } from './components/card';",
    '<CardContent className=',
    '</CardContent>',
    '<CardTitle\n',
    '</CardTitle>',
    '<Card\n',
    '</Card>',
  ],
  'packages/ui/src/CardRail.tsx': [
    "import { CardHeader } from './components/card';",
    '<CardHeader ',
    '</CardHeader>',
  ],
  'packages/ui/test/design-system-baseline.test.tsx': [
    ['  Card,', '  CardContent,', '  CardDescription,', '  CardHeader,', '  CardTitle,'].join('\n'),
    '<CardDescription>',
    '</CardDescription>',
    '<CardContent>',
    '</CardContent>',
    '<CardHeader>',
    '</CardHeader>',
    '<CardTitle>',
    '</CardTitle>',
    '<Card>',
    '</Card>',
  ],
  'packages/app/stories/review/space-card-canvas-prototype.stories.tsx': [
    ['  Card,', '  CardAction,', '  CardHeader,', '  CardContent,', '  CardTitle,'].join('\n'),
    '<CardContent>',
    '</CardContent>',
    '<CardAction>',
    '</CardAction>',
    '<CardHeader>',
    '</CardHeader>',
    '<CardTitle>',
    '</CardTitle>',
    '<Card\n',
    '</Card>',
  ],
};

/** Applied after masking, longest key first. */
const RENAMES = [
  ['CARDS', 'THINGS'],
  ['Cards', 'Things'],
  ['cards', 'things'],
  ['CARD', 'THING'],
  ['Card', 'Thing'],
  ['card', 'thing'],
];

/**
 * A sentinel no source in this repository contains. Spelled without control
 * characters so a masked intermediate stays greppable if this script is ever
 * stopped half way through a file.
 */
const mask = (index) => `@@PROTECTED_${index}@@`;

const rewrite = (text, file) => {
  let masked = text;
  for (const [from, to] of PRE_REWRITES) masked = masked.split(from).join(to);

  const tokens = [...PROTECTED, ...(FILE_PROTECTED[file] ?? [])];
  tokens.forEach((token, index) => {
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
  tokens.forEach((token, index) => {
    masked = masked.split(mask(index)).join(token);
  });
  return masked;
};

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

let changedFiles = 0;
for (const file of tracked) {
  if (BINARY.test(file)) continue;
  const absolute = join(repoRoot, file);
  if (!existsSync(absolute)) continue;
  const before = readFileSync(absolute, 'utf8');
  if (!/card/i.test(before)) continue;
  const after = rewrite(before, file);
  if (after === before) continue;
  changedFiles += 1;
  if (!dryRun) writeFileSync(absolute, after);
}

/**
 * Every card-named path follows the vocabulary, including the two inventory
 * directories. Unlike change one there is no kept basename: the argument that
 * saved `layout.ts` was that the word in it is the verb, and no export of
 * `card-file.ts` is anything but a domain name.
 *
 * `packages/ui/src/components/card.tsx` is not here because it is excluded
 * above and never reaches this loop.
 */
const renamePath = (path) =>
  path
    .split('/')
    .map((segment) => segment.replace(/cards/g, 'things').replace(/Cards/g, 'Things').replace(/card/g, 'thing').replace(/Card/g, 'Thing'))
    .join('/');

let renamedPaths = 0;
for (const file of tracked) {
  if (!/card/i.test(file)) continue;
  const renamed = renamePath(file);
  if (renamed === file) continue;
  renamedPaths += 1;
  if (dryRun) continue;
  // The two inventory directories are renamed by renaming the files inside
  // them, and `git mv` will not create the destination.
  mkdirSync(join(repoRoot, dirname(renamed)), { recursive: true });
  execFileSync('git', ['mv', file, renamed], { cwd: repoRoot });
}

console.log(`${dryRun ? 'would rewrite' : 'rewrote'} ${changedFiles} files`);
console.log(`${dryRun ? 'would rename' : 'renamed'} ${renamedPaths} paths`);
