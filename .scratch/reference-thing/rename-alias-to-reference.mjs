#!/usr/bin/env node
/**
 * ADR 0092: Alias becomes Reference Thing.
 *
 * The third of these sweeps, after `.scratch/thing-and-diagram/rename-layout-to-diagram.mjs`
 * and `rename-card-to-thing.mjs`. Read the first of those two before this one —
 * the mask / rewrite / unmask design and the two failures that shaped
 * `EXCLUDED_PATHS` are recorded there and are not repeated here. What follows
 * is only what is different about this word.
 *
 * Usage:
 *   node .scratch/reference-thing/rename-alias-to-reference.mjs [--dry]
 *   pnpm exec prettier --write .
 *
 * **This rename is not a one-for-one word swap, and that is the whole reason
 * it needs more machinery than its two predecessors.** Card became Thing and
 * Layout became Diagram as a single substring, everywhere. Alias becomes two
 * different things depending on how it is written:
 *
 *  - an **identifier fragment** — `AliasIcon`, `aliasOf`, `ALIAS_ID`,
 *    `alias-target-immutable`, `kind: 'alias'` — becomes the one-word
 *    `Reference`/`reference`/`REFERENCE`, exactly as Card became Thing. Where
 *    the identifier already carried `Thing` after it (`aliasThingSchema`), the
 *    two-word compound falls out of that substitution for free, the same way
 *    `spaceThingFrontmatterSchema` already reads.
 *  - the **bare word, standing for the kind itself** — "An Alias chooses its
 *    Target", the accessible name `'Alias'`, the button label `'Aliases, 0'` —
 *    becomes the two-word product name `Reference Thing`, because that is the
 *    name ADR 0092 gives it and the name `CONTEXT.md` already uses throughout.
 *    `Alias` also ends in `s`, so its plural is `Aliases` (`+es`), not the
 *    `+s` every previous rename's noun took.
 *
 * A capital letter is what tells the two apart, and reliably: nowhere in this
 * codebase is a lowercase standalone `alias` the product noun — every prose
 * mention of the kind capitalises it, and a bare lowercase `alias` is always
 * either an identifier fragment or the *other*, genuinely foreign, sense of
 * the word (see `PROTECTED` below). So `rewriteStandaloneAlias` below expands
 * only the capitalised, whole-word spelling, before the ordinary substring
 * table runs on everything that is left — including the two known verb forms,
 * `aliased`/`aliasing`, which take their own table rows because neither
 * survives passing through the one-word rule first (`alias` + `ed` is not
 * `reference` + `ed`; it has to become `referenced` in one step or the result
 * is `referenceed`).
 *
 * One further phrase needs handling ahead of the rest: `An Alias` reads `A
 * Reference Thing`, not `An Reference Thing` — the indefinite article changes
 * with the noun's initial sound, and this is the first of these three renames
 * where the retired and replacement words start with a different one.
 * `rewriteStandaloneAlias` fixes the two-word "An Alias" phrase in the same
 * pass as the noun it precedes, and `PRE_REWRITES` fixes the four remaining
 * instances the general rule cannot reach (see its own comment).
 *
 * Four things in the rename commit are NOT produced here, because none of
 * them is a spelling:
 *   - `test/unit/context-alias-opening.test.ts` → `context-reference-opening.test.ts`
 *     is a `git mv`, done by the caller once this script has rewritten its
 *     contents, exactly as every other renamed path here is;
 *   - the two-word→two-word wording ADR 0092 chose for the qualified badge
 *     name, `Alias of a Markdown/Space Thing` → `Reference to a
 *     Markdown/Space Thing`, is a `PRE_REWRITES` entry rather than a spelling,
 *     because "of a" becoming "to a" is not a substitution any table below
 *     performs generally;
 *   - this rename's guard block in `test/unit/current-domain-vocabulary.test.ts`;
 *   - `Copy link to Target` (issue 02) and `Jump to Target` — this rename
 *     touches neither.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry');

/** The same three trees the vocabulary guard excludes, for the same reason. */
const HISTORICAL = ['docs/adr/', 'docs/superpowers/', '.scratch/'];

/**
 * Files this sweep must not open at all, as opposed to spellings it must not
 * change.
 *
 * `pnpm-lock.yaml` and `skills-lock.json` are change one's entries and carry
 * over on principle — neither has an `alias` hit today, but a lockfile is
 * where an unseen rename becomes a CI-only failure, per that script's own
 * story. `.agents/skills/shadcn/` is vendored guidance pinned by
 * `skills-lock.json` and is written throughout in the shadcn CLI's own path-
 * alias vocabulary (`aliasPrefix`, `aliases.components`, …) — none of it ours.
 * `tools/oxlint/anti-slop/` is the vendored anti-slop rule set, and its
 * `alias` vocabulary is TypeScript's **type alias**, a different contract
 * this rename has nothing to say about (`no-unknown-type-aliases`,
 * `TypeAliasEnvironment`, `isPlainAliasConsumerUse`).
 *
 * The remaining eight are every file whose only `alias` content is a path or
 * import alias — Vite/Vitest's own `resolve.alias`, the module that builds it,
 * or the shadcn CLI's own `components.json` contract — and none of it is a
 * name this codebase chose:
 *   - `packages/app/workspace-aliases.ts` builds the `@project/*` path table
 *     `vite.config.ts`, `http-server-build.config.ts` and Vitest's own two
 *     configs pass to `resolve.alias`; excluding the table and its four
 *     consumers together is what keeps the real Vite/Vitest API property
 *     `alias` — which must stay spelled exactly that way or the dev server
 *     and the test runner stop resolving `@project/*` at all — out of reach
 *     of a substring sweep;
 *   - `packages/app/e2e/space-thing-drag-benchmark-vite.config.ts` builds its
 *     own equivalent table for the same reason;
 *   - `packages/app/components.json` and `packages/ui/components.json` are
 *     the shadcn CLI's own generated config, whose `aliases` key is that
 *     tool's contract to read, not this codebase's to rename.
 *
 * `CONTEXT.md` is last, and different in kind: it is not foreign vocabulary,
 * it is the *finished* state ADR 0092 already put there. Its `_Avoid_` line
 * under **Reference Thing** has to keep saying the retired word to retire it
 * — the same reason a retirement notice is masked rather than swept in every
 * vocabulary-guard block that carries one.
 *
 * **`test/unit/current-domain-vocabulary.test.ts` is excluded whole, and not
 * for either reason above.** It is not foreign vocabulary and it is not
 * finished state — it is the guard itself, hand-written before this script
 * runs (see this rename's own issue and `docs/agents/workflow.md`'s rename
 * rule), and it fails closed if swept: the file's own prose explains what
 * `alias` retires, in a sentence a blind substring sweep cannot tell from a
 * leftover instance, and three unrelated existing blocks (`the vocabulary the
 * loose-name guard reads`, ADR 0088's aggregate block) use `alias` as ordinary
 * English for an unrelated import rename, in text and in a screaming-case
 * identifier a sweep reads exactly as it reads this rename's own. A first
 * version of this script swept the file anyway and both failure modes fired
 * at once — this exclusion, and the guard block being hand-written rather
 * than generated, are the same fact stated twice.
 */
const EXCLUDED_PATHS = [
  'pnpm-lock.yaml',
  'skills-lock.json',
  '.agents/skills/shadcn/',
  'tools/oxlint/anti-slop/',
  'packages/app/workspace-aliases.ts',
  'packages/app/vite.config.ts',
  'packages/app/http-server-build.config.ts',
  'packages/app/e2e/space-thing-drag-benchmark-vite.config.ts',
  'vitest.config.ts',
  'vitest.integration.config.ts',
  'packages/app/components.json',
  'packages/ui/components.json',
  'CONTEXT.md',
  'test/unit/current-domain-vocabulary.test.ts',
  // This test reads `http-server-build.config.ts`'s real, excluded output —
  // `resolve.alias` typed and destructured three ways (a type annotation, an
  // optional-chained read, an object-entries loop) that a masked substring
  // cannot catch in all three shapes at once. Excluding the file is simpler
  // and exact: every `alias` in it names that one real property.
  'test/unit/http-server-build-config.test.ts',
];

/**
 * Exact phrases rewritten before anything else, longest first where one is a
 * substring of another. Four kinds:
 *
 *  - the menu label ADR 0092 gives its own wording, shorter than the noun's:
 *    **`Create Reference`**, not `Create Reference Thing` — every other
 *    standalone `Alias` becomes the two-word noun, and this is the one place
 *    the product spells the command with the one-word verb-object pairing
 *    `Create Diagram`/`Create Graph` already use;
 *  - the two qualified badge names, where "of a" becomes "to a" rather than
 *    surviving as `Reference Thing of a Markdown Thing`;
 *  - the one place `alias` is a **verb** in running prose ("they want to
 *    alias, which is why") rather than the noun everywhere else — this reads
 *    `to reference` afterward, and the general rules below have no way to
 *    single out a verb from the noun that is spelled identically;
 *  - four sentences the general rules cannot reach at all: two because the
 *    two-word noun phrase they name (`alias thing`/`Alias Thing`) would
 *    otherwise double the following `Thing`/`thing` the sentence already
 *    supplies; two because `an aliased` needs the same one-step article-and-
 *    noun rewrite as `an Alias` does, and the general `aliased`→`referenced`
 *    row runs too late to fix the article that preceded it, one of the two
 *    sites also wrapping the word this ships across a line break, which no
 *    single-line phrase match could reach if it had to include what follows.
 *  - `an alias thing`/`an Alias Thing`, longest-first ahead of the bare
 *    `alias thing`/`Alias Thing` rows: the phrase rows below leave `an`
 *    standing, and `rewriteAnAlias` runs after them and can no longer see
 *    `alias` once they have already spent it — so the three sites this
 *    exact phrase appears at need the article fixed here, once, rather than
 *    in two places whose order would matter.
 */
const PRE_REWRITES = [
  ['Create Alias', 'Create Reference'],
  // Ladle derives a story id from its `storyName`, which the standalone rule
  // expands to `Open Reference Thing`; the spec's URL has to follow it.
  ['thing--open-alias&', 'thing--open-reference-thing&'],
  // Longest first, for the reason `an alias thing`/`an Alias Thing` are below:
  // the bare phrase rows leave a preceding `an` standing, and it needs `a`
  // once `Alias` becomes `Reference`.
  ['an Alias of a Markdown Thing', 'a Reference to a Markdown Thing'],
  ['an Alias of a Space Thing', 'a Reference to a Space Thing'],
  ['Alias of a Markdown Thing', 'Reference to a Markdown Thing'],
  ['Alias of a Space Thing', 'Reference to a Space Thing'],
  ['want to alias, which is why', 'want to reference, which is why'],
  ['an alias thing', 'a reference thing'],
  ['an Alias Thing', 'a Reference Thing'],
  ['alias thing', 'reference thing'],
  ['Alias Thing', 'Reference Thing'],
  ['an **alias** thing', 'a **reference thing**'],
  ['An **alias** is a distinct thing', 'A **reference thing** is a distinct thing'],
  [
    'Each returns to its start via an alias, so this particular fixture is acyclic',
    'Each returns to its start via a reference thing, so this particular fixture is acyclic',
  ],
  [
    '(an alias node names its target, so "A" appears on more than one)',
    '(a reference thing node names its target, so "A" appears on more than one)',
  ],
  ['an aliased', 'a referenced'],
  ['An aliased', 'A referenced'],
];

/**
 * Spellings where `alias` is a wholly different, foreign contract — kept
 * verbatim in files this sweep does not otherwise exclude wholesale, because
 * those files also carry — or will carry — this rename in the same breath.
 * Masked before every other step and restored after, so nothing downstream
 * ever sees them.
 *
 *  - the oxlint rule id, cited by `.oxlintrc.json` and `docs/agents/anti-slop.md`
 *    outside the vendored tree that defines it;
 *  - the path-alias table's own filename, cited by `AGENTS.md`'s "workspace"
 *    bullet;
 *  - `resolve.alias`, `AGENTS.md`'s own citation of the real Vite/Vitest
 *    config key;
 *  - `path aliases:`, an ordinary sentence-colon in `AGENTS.md` that a
 *    substring sweep cannot tell from an object key;
 *  - `illegal alias unresolvable` and `no alias at all`, two more `AGENTS.md`
 *    sentences about the same path-alias table, phrased in a way `PRE_REWRITES`
 *    would otherwise mangle (an "illegal reference" or "no reference at all"
 *    reads as this rename's own kind, not as a broken import path);
 *   - `aliases \`../core/src/index.ts\``, `eslint.config.js`'s comment
 *     describing the same table's one legitimate relative escape;
 *  - two `.coderabbit.yaml` sentences about the same subject in its own
 *    phrasing, and one about an unrelated rename's import alias;
 *  - `behind an alias`, `docs/agents/anti-slop.md`'s one mention of a
 *    TypeScript type alias;
 *  - `plain-alias-consumer` and `chain of type aliases`,
 *    `test/unit/anti-slop/no-unsafe-dictionary-type.test.ts`'s own two
 *    mentions of the same TypeScript contract;
 *  - `Route-named aliases`, two agent-facing documents' own phrase for a
 *    backward-compatible type alias ADR 0041's rename does not want kept —
 *    `references` there reads as *this* rename's kind, which is exactly
 *    backward;
 *  - `isTypeAliasDeclaration`, the real `typescript` compiler API two test
 *    files call to find a `type X = …` declaration by AST shape — a
 *    TypeScript type alias again, and a function neither test file owns the
 *    name of;
 *  - `The import alias in`, `bans the alias`, `docs/agents/editing-and-persistence.md`'s
 *    own account of ADR 0088's rename, which named its own import alias — a
 *    different rename's leftover, not this one's;
 *  - `.scratch/alias-cards/issues/05-jump-to-alias-target.md`, a citation into
 *    the historical tree this sweep does not rewrite. `HISTORICAL` excludes
 *    that tree's *contents*; it does nothing for a live document naming a path
 *    into it, and a renamed citation is a dangling pointer — the failure this
 *    repository's own guard comments (`current-domain-vocabulary.test.ts`)
 *    record as having already happened twice, for two other renames.
 */
const PROTECTED = [
  'no-unknown-type-aliases',
  'workspace-aliases',
  'resolve.alias',
  'path aliases:',
  'illegal alias unresolvable',
  'no alias at all',
  "aliases `../core/src/index.ts`",
  'Vite needs no `@project/*` alias — it',
  'do not add a third alias list',
  'the import alias that dodged the collision',
  'behind an alias',
  'plain-alias-consumer',
  'chain of type aliases',
  'Route-named aliases',
  'The import alias in',
  'bans the alias',
  '.scratch/alias-cards/issues/05-jump-to-alias-target.md',
  'isTypeAliasDeclaration',
  // TypeScript's and the language's own senses, written in source comments.
  'Kept as a type alias',
  'The type alias above',
  'the alias above already',
];

/**
 * Turns the two-word phrase `An Alias`/`an Alias`/`an alias`, optionally
 * possessive, into `A Reference Thing`/`a reference thing` — the one place
 * this rename changes the indefinite article, because the replacement noun
 * starts with a different sound than the word it replaces. Every other
 * article in the tree is untouched by this rule: it matches only the exact
 * two words in sequence, so "an existing Alias" or "an aliased Thing" (a
 * different word, handled below) never reach it.
 *
 * Lowercase `alias` needs this rule too, and that looks like a departure from
 * "capitalisation selects prose over code" until the shape is checked: `an` is
 * not a valid predecessor of an identifier in either language this repository
 * writes, so `an alias` — lowercase, prose, mid-sentence — is exactly as safe
 * to expand as the capitalised form, and it stays the lowercase noun rather
 * than the capitalised one for the same reason `alias thing` stays lowercase
 * below: casual prose ("resolves to its target", "accepts an alias") does not
 * capitalise the kind the way a proper reference to it does.
 */
const rewriteAnAlias = (text) =>
  text.replace(/\b([Aa])n(\s+(?:\*\s+|\/\/\s+)?)([Aa])lias('s)?\b/g, (_match, article, gap, aliasCase, possessive) => {
    const a = article === 'A' ? 'A' : 'a';
    const noun = aliasCase === 'A' ? 'Reference Thing' : 'reference thing';
    return `${a}${gap}${noun}${possessive ?? ''}`;
  });

/**
 * Turns every remaining **standalone, capitalised** `Alias`/`Aliases`/`Alias's`
 * into the two-word product name, wherever it stands for the kind itself
 * rather than forming half of a compound.
 *
 * "Standalone" is a letter, a hyphen or an underscore on neither side — the
 * three shapes an identifier or a kebab-case name would attach with, and the
 * only three this codebase ever attaches the word with. A quote, a backtick,
 * whitespace or ordinary punctuation are all fine on either side, which is
 * deliberate: the accessible name `'Alias'`, the button label `'Aliases, 0'`
 * and the quoted term `definitionOf('Alias')` are exactly the shape this rule
 * exists to reach, and none of them is an identifier.
 *
 * Capitalisation is what selects prose over code: nowhere in this tree does a
 * bare lowercase `alias` stand for the kind — every prose mention of it
 * capitalises the word, and a lowercase standalone `alias` is always either a
 * plain identifier (`const alias = …`, a destructured `alias` parameter) or
 * the foreign, path-alias sense `PROTECTED` already keeps out of reach. Both
 * of those want the ordinary one-word substitution the table below performs,
 * so this rule leaves lowercase alone on purpose and `ALIAS` (screaming case)
 * alone for the same reason — screaming case is always an identifier.
 *
 * Suffixes: no suffix is the ordinary case; `es` is the plural (`alias` already
 * ends in `s`, so English pluralises it `+es`, not `+s`); `'s` is the
 * possessive. `Alias` followed by a different suffix — `Aliased`, `Aliasing` —
 * is a different word by the time it reaches here (see the table below) and
 * this rule's own word-boundary check already excludes it: `d`/`i` following
 * `s` inside `Aliased`/`Aliasing` never lands on a boundary, so the match
 * fails closed rather than needing a lookahead written to exclude them.
 */
const rewriteStandaloneAlias = (text) =>
  text.replace(/(?<![-\w])Alias(es|'s)?(?![-\w])/g, (_match, suffix) => {
    if (suffix === 'es') return 'Reference Things';
    if (suffix === "'s") return "Reference Thing's";
    return 'Reference Thing';
  });

/**
 * The ordinary one-word substitution, applied after every rule above has
 * already spent the two-word phrasing it needs. Longest key first, so
 * `Aliased`/`Aliasing`/`Aliases` are replaced whole before the bare `Alias`
 * row can leave a stray `ed`/`ing`/`es` behind it (`alias` + `ed` naively
 * substituted is `referenceed`, not `referenced`).
 *
 * `Aliased`/`Aliasing` need their own rows for exactly that reason — dropping
 * the whole retired word and reattaching the suffix to `reference` is not the
 * same operation as substituting `alias` → `reference` inside the longer word,
 * and the two rows are what make it one step instead of a broken two.
 */
const RENAMES = [
  ['ALIASED', 'REFERENCED'],
  ['Aliased', 'Referenced'],
  ['aliased', 'referenced'],
  ['ALIASING', 'REFERENCING'],
  ['Aliasing', 'Referencing'],
  ['aliasing', 'referencing'],
  ['ALIASES', 'REFERENCES'],
  ['Aliases', 'References'],
  ['aliases', 'references'],
  ['ALIAS', 'REFERENCE'],
  ['Alias', 'Reference'],
  ['alias', 'reference'],
];

/**
 * A sentinel no source in this repository contains. Spelled without control
 * characters so a masked intermediate stays greppable if this script is ever
 * stopped half way through a file.
 */
const mask = (index) => `@@PROTECTED_${index}@@`;

const rewrite = (text) => {
  let masked = text;
  for (const [from, to] of PRE_REWRITES) masked = masked.split(from).join(to);
  PROTECTED.forEach((token, index) => {
    masked = masked.split(token).join(mask(index));
  });
  masked = rewriteAnAlias(masked);
  masked = rewriteStandaloneAlias(masked);
  for (const [from, to] of RENAMES) masked = masked.split(from).join(to);
  PROTECTED.forEach((token, index) => {
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
  if (!/alias/i.test(before)) continue;
  const after = rewrite(before);
  if (after === before) continue;
  changedFiles += 1;
  if (!dryRun) writeFileSync(absolute, after);
}

/**
 * The one renamed path. Unlike the two predecessor sweeps this is a single
 * file, named directly rather than found by a blanket `alias`-in-filename
 * scan, because `.scratch/alias-cards/` and several ADR filenames both carry
 * the retired word and are historical — a blanket rename would rename history.
 */
const RENAMED_PATH = 'test/unit/context-alias-opening.test.ts';
const RENAMED_PATH_TARGET = 'test/unit/context-reference-opening.test.ts';

let renamedPaths = 0;
if (tracked.includes(RENAMED_PATH)) {
  renamedPaths += 1;
  if (!dryRun) {
    execFileSync('git', ['mv', RENAMED_PATH, RENAMED_PATH_TARGET], { cwd: repoRoot });
  }
}

console.log(`${dryRun ? 'would rewrite' : 'rewrote'} ${changedFiles} files`);
console.log(`${dryRun ? 'would rename' : 'renamed'} ${renamedPaths} paths`);
