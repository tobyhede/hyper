#!/usr/bin/env node
/**
 * ADR 0136's sibling change: the application Hyper becomes InfinityCube.
 *
 * Tracked for the reason `.scratch/thing-and-diagram/rename-card-to-thing.mjs`
 * is: a branch in flight when this lands replays it rather than hand-merging
 * a few hundred files. Read that script's header first; the mask / rewrite /
 * unmask design is the same and is not repeated here.
 *
 * Usage, from the repository root, on a tree where ADR 0136 has landed
 * (`aggregate.json`, not `hyper.json`):
 *   node .scratch/infinity-cube/rename-hyper-to-infinity-cube.mjs [--dry]
 *   pnpm exec prettier --write .
 *
 * The spellings, decided with Toby on 2026-10-26:
 *   - prose and PascalCase `InfinityCube`, camelCase `infinityCube`,
 *     upper case `INFINITY_CUBE`, kebab and lower case `infinity-cube`;
 *   - the CLI is `pnpm infinity-cube`, and `pnpm cube` is its shorthand, which
 *     every document and every hint the CLI prints uses;
 *   - a database name, user or password is `infinity_cube`, since PostgreSQL
 *     would need a hyphenated identifier quoted;
 *   - a problem type is `urn:infinity-cube:problem:<code>`;
 *   - the repository is `tobyhede/infinity-cube`, renamed on GitHub after the
 *     change merges.
 *
 * Three things in the rename commit are NOT produced here. A branch replaying
 * this takes them from the merge:
 *   - `package.json`'s second script, `cube`, beside the renamed one, and
 *     `src/cli/process.ts` accepting either lifecycle event;
 *   - the `.claude/skills/` symlinks, re-pointed at the renamed skill
 *     directories (this script only moves regular files);
 *   - this rename's guard block in `test/unit/current-domain-vocabulary.test.ts`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry');

/** The same three trees the vocabulary guard excludes, for the same reason. */
const HISTORICAL = ['docs/adr/', 'docs/superpowers/', '.scratch/'];

/**
 * Files this sweep must not open at all.
 *
 * `migrations/` and `migrations-sqlite/` hold history snapshots, which are
 * never rewritten; a swept snapshot passes against a migrated local database
 * and fails against a fresh one. The two lockfiles are blind to a local check
 * and fatal on a clean install. The vendored `shadcn` skill is pinned by
 * `skills-lock.json`.
 */
const EXCLUDED_PATHS = [
  'pnpm-lock.yaml',
  'skills-lock.json',
  '.agents/skills/shadcn/',
  'migrations/',
  'migrations-sqlite/',
];

/**
 * Spellings that keep the old name, in every file.
 *
 * - `/Users/tobyhede/psrc/hyper` is a checkout on Toby's machine, which the
 *   repository rename does not move.
 * - `hyper.json` is the root file ADR 0136 renamed, which the guidance on
 *   moving an existing talk has to name.
 */
const PROTECTED = [
  '/Users/tobyhede/psrc/hyper',
  "`wrangler.jsonc`'s `hyper`",
  // The earlier root file, named where an author or operator is told to move it.
  'hyper.json',
];

/**
 * Applied before masking: the one live path under `.scratch/`, which the
 * citation mask below would otherwise freeze.
 */
const PRE_RENAMES = [['.scratch/sqlite/hyper.db', '.scratch/sqlite/infinity-cube.db']];

/**
 * Spellings that keep the old name inside one file.
 *
 * The Worker's name is the deployed Cloudflare Worker's identity: renaming it
 * deploys a second Worker beside the first rather than renaming it, so it moves
 * only when Toby moves the Worker.
 */
const FILE_PROTECTED = {
  'wrangler.jsonc': ['"name": "hyper"'],
};

/**
 * Rewrites inside one file, applied before the general ones: local bindings
 * spelled as the bare word, which the general lower-case rule would turn into
 * a hyphenated name that is not an identifier.
 */
const FILE_RENAMES = {
  'test/unit/aggregate-json-schema.test.ts': [[/\bhyper\b(?=[ ,\]])/g, 'aggregateFile']],
  'test/integration/sqlite-hyper-cli.test.ts': [[/\bhyper\b(?= =|\()/g, 'cube']],
  'test/unit/agent-skill-commands.test.ts': [[/toContain\('hyper'\)/g, "toContain('cube')"]],
};

/** Citations into the trees this sweep does not rewrite: a `.scratch/` path or an ADR slug. */
const PROTECTED_PATTERNS = [/\.scratch\/[A-Za-z0-9._/-]+/g, /\b\d{4}-[a-z0-9-]+/g];

/**
 * Applied in order after masking. The CLI and database rules come first, so the
 * general lower-case rule at the end sees only what is left.
 */
const RENAMES = [
  // The problem types.
  [/https:\/\/hyper\.dev\/problems\//g, 'urn:infinity-cube:problem:'],

  // The repository.
  [/tobyhede\/hyper\b/g, 'tobyhede/infinity-cube'],
  [/\bcd hyper\b/g, 'cd infinity-cube'],

  // The CLI, by its shorthand.
  [/\bpnpm hyper\b/g, 'pnpm cube'],
  [/\bUsage: hyper\b/g, 'Usage: cube'],
  [/`  hyper \$\{/g, '`  cube ${'],
  [/'  hyper '/g, "'  cube '"],
  [/manifest\.scripts\.hyper\b/g, 'manifest.scripts.cube'],
  [/'hyper' in manifest\.scripts/g, "'cube' in manifest.scripts"],
  [/concurrent `hyper`/g, 'concurrent `cube`'],
  [/(?<![A-Za-z0-9_.-])hyper (?=(init|run|import|export|help)\b)/g, 'cube '],
  [/`hyper`(?= (verb|command|CLI|script|package|entry))/g, '`cube`'],
  [/\bthe hyper (?=(script|entry))/g, 'the cube '],
  [/second `hyper`/g, 'second `cube`'],
  [/lifecycleEvent: 'hyper'/g, "lifecycleEvent: 'cube'"],
  [/npm_lifecycle_event'\] === 'hyper'/g, "npm_lifecycle_event'] === 'cube'"],
  [/^(\s*)"hyper": "exec /gm, '$1"infinity-cube": "exec '],

  // Database names, users and passwords.
  [/\bhyper_ci\b/g, 'infinity_cube_ci'],
  [/\b(POSTGRES_DB|POSTGRES_USER)=hyper\b/g, '$1=infinity_cube'],
  [/(postgres(?:ql)?:\/\/)hyper:hyper@/g, '$1infinity_cube:infinity_cube@'],
  [/(postgres(?:ql)?:\/\/)hyper:/g, '$1infinity_cube:'],
  [/(@127\.0\.0\.1:[0-9${}a-z]+\/)hyper\b/g, '$1infinity_cube'],
  [/(user|database) "hyper"/g, '$1 "infinity_cube"'],

  // Identifiers and prose.
  [/HYPER/g, 'INFINITY_CUBE'],
  [/Hyper/g, 'InfinityCube'],
  [/(?<![A-Za-z0-9])hyper(?=[A-Z])/g, 'infinityCube'],
  [/\bhyper_/g, 'infinity_cube_'],
  [/\bhyper\b/g, 'infinity-cube'],
];

const mask = (index) => `@@PROTECTED_${index}@@`;

const rewrite = (text, file) => {
  let masked = text;
  for (const [from, to] of PRE_RENAMES) masked = masked.split(from).join(to);
  const tokens = [...PROTECTED, ...(FILE_PROTECTED[file] ?? [])];
  tokens.forEach((token, index) => {
    masked = masked.split(token).join(mask(index));
  });
  const captured = [];
  for (const pattern of PROTECTED_PATTERNS) {
    masked = masked.replace(new RegExp(pattern.source, 'g'), (match) => {
      captured.push(match);
      return mask(`P${captured.length - 1}`);
    });
  }
  for (const [from, to] of [...(FILE_RENAMES[file] ?? []), ...RENAMES]) masked = masked.replace(from, to);
  captured.forEach((match, index) => {
    masked = masked.split(mask(`P${index}`)).join(match);
  });
  tokens.forEach((token, index) => {
    masked = masked.split(mask(index)).join(token);
  });
  return masked;
};

const NUL = String.fromCharCode(0);

/** Regular blobs only: `.claude/skills/` holds symlinks and `CLAUDE.md` is one. */
const REGULAR_FILE_MODES = new Set(['100644', '100755']);

const tracked = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  .split(NUL)
  .flatMap((entry) => {
    const separator = entry.indexOf('\t');
    if (separator === -1) return [];
    const file = entry.slice(separator + 1);
    if (!REGULAR_FILE_MODES.has(entry.slice(0, 6))) return [];
    if (EXCLUDED_PATHS.some((path) => file === path || file.startsWith(path))) return [];
    return HISTORICAL.some((tree) => file.startsWith(tree)) ? [] : [file];
  });

const BINARY = /\.(png|jpg|jpeg|gif|ico|woff2?|pdf|webp)$/i;

let changedFiles = 0;
for (const file of tracked) {
  if (BINARY.test(file)) continue;
  const absolute = join(repoRoot, file);
  if (!existsSync(absolute)) continue;
  const before = readFileSync(absolute, 'utf8');
  if (!/hyper/i.test(before)) continue;
  const after = rewrite(before, file);
  if (after === before) continue;
  changedFiles += 1;
  if (!dryRun) writeFileSync(absolute, after);
}

/** Every hyper-named path follows the kebab spelling. */
const renamePath = (path) =>
  path
    .split('/')
    .map((segment) => segment.replace(/hyper/g, 'infinity-cube'))
    .join('/');

let renamedPaths = 0;
for (const file of tracked) {
  if (!/hyper/.test(file)) continue;
  const renamed = renamePath(file);
  if (renamed === file) continue;
  renamedPaths += 1;
  if (dryRun) continue;
  mkdirSync(join(repoRoot, dirname(renamed)), { recursive: true });
  execFileSync('git', ['mv', file, renamed], { cwd: repoRoot });
}

console.log(`${dryRun ? 'would rewrite' : 'rewrote'} ${changedFiles} files`);
console.log(`${dryRun ? 'would rename' : 'renamed'} ${renamedPaths} paths`);
