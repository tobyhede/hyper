# Vendor anti-slop and enable the 5 clean rules

Status: resolved

## Context

`research.md` decided adoption; this is its steps 1-3, unchanged by the
follow-up scope pass. No production or test code changes — this ticket only
adds tooling.

Hyper has no Oxlint today (`pnpm lint` is ESLint only). Anti-slop is an Oxlint
JavaScript plugin and cannot be registered in the existing flat ESLint config.

## Direction

1. Vendor upstream `src/` from `https://github.com/dmmulroy/anti-slop` at commit
   `6d538555cb151d4121ed51a27db81890eacf8ae9` under `tools/oxlint/anti-slop/`,
   preserving `LICENSE` (MIT) and adding a provenance file that names the
   commit and the source URL.
2. Install `oxlint` and `@oxlint/plugins` at `1.78.0` (the version the pinned
   commit was built and tested against).
3. Add `oxlint.config.ts` pointing at the vendored plugin, scoped to
   `packages`, `src`, `test`, `e2e`, `scripts` — mirror the ignores already in
   `eslint.config.js` (`dist`, `dist-http`, `packages/app/build`,
   `node_modules`, `playwright-report`, `test-results`, `coverage`,
   `.tanstack`, `.scratch`, `.serena`, `.claude`, `.agents`, `.worktrees`,
   generated Prisma contract files).
4. Enable only the 5 already-clean rules at error severity:
   `no-object-parameters`, `no-reflect-apply`, `no-reflect-get`,
   `no-unknown-type-aliases`, `no-widen-then-assert`.
5. Add a `lint:anti-slop` script and confirm it passes clean against the
   current branch.
6. Add `lint:anti-slop` to `pnpm verify`.
7. Leave the other 10 generic rules present in the vendored source but
   disabled in `oxlint.config.ts` — each later phase enables its own rule(s)
   as it lands, so a regression in an unmigrated rule can't silently pass
   `verify` before its phase is done.

## Caution

Don't enable all 15 rules and rely on future phases to clean up — that leaves
`verify` red on `main` between now and the last phase, which blocks unrelated
work. Enable a rule only when its migration phase has actually landed.

## Resolution

Implemented mostly as planned, with two deviations found during setup and one
found by code review:

- **`.oxlintrc.json`, not `oxlint.config.ts`.** Oxlint's own `--help` marks
  JS/TS config files as experimental; `.oxlintrc.json` is the stable default
  and supports `jsPlugins` (including a `.ts` plugin specifier) and
  `ignorePatterns` directly, with JSONC comments. Using the stable format for
  no loss of capability.
- **Scan target is `.`, not a hand-maintained directory list.** The original
  direction listed `packages src test scripts e2e` to mirror the evidence
  run's scope. Code review caught that this allow-list silently missed
  `migrations/**/*.ts` (hand-authored migration files) and every root
  `*.config.ts` — both of which `tsc` and `eslint .` already cover, so the new
  gate covered strictly less than the gates beside it. Verified
  `packages/app/ladle-e2e` was *not* actually missing (a directory argument to
  oxlint recurses its whole subtree, so `packages` already reached it) — that
  part of the review finding was wrong, but the migrations/config-file gap was
  real. Fixed by scanning `.` the same way `eslint .` does, with
  `ignorePatterns` doing the exclusion instead of an allow-list. Confirmed
  zero new findings from the newly-covered files.
- **`no-object-parameters` etc. wired through `plugins: []` and
  `categories: {}`**, so `lint:anti-slop` only ever reports anti-slop
  findings — Oxlint's own built-in rule categories (which produced the 3
  unrelated findings issue 08 tracks) stay off until that separate decision is
  made. Oxlint still runs ~57 baseline correctness rules regardless of this
  setting (confirmed via `--print-config`); none currently fire.
- Code review also flagged that `.oxlintrc.json`'s `ignorePatterns` duplicates
  `eslint.config.js`'s `ignores` array with no shared source, so the two can
  drift. Not building a sync mechanism for this ticket's scope — added a
  cross-reference comment in `.oxlintrc.json` instead, matching how the
  tsconfig `paths` duplication elsewhere in the repo is handled (documented,
  not mechanically enforced). A third review finding (an intermittent
  `format:check` ENOENT on a `packages/app/src/__oxtest__.ts` file) could not
  be reproduced across three back-to-back runs and matches no reference
  anywhere in the repo or `node_modules` — treated as a review hallucination,
  not fixed.

`pnpm verify` (typecheck, typecheck:packages, ui:catalog:check, lint,
lint:anti-slop, format:check, test:coverage) passes end to end: 128 test files
passed (1289 tests, 8 skipped).
