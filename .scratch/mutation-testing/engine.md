# The engine is StrykerJS

The bake-off asked for by issue `01`. Both engines were spiked in their own disposable worktrees, both against the same target — `packages/persistence/src/session.ts` mutated, `packages/persistence/test/session.test.ts` as the oracle — and both worktrees have been deleted. The full evidence is in `spike-stryker.md` and `spike-mewt.md`; this file records the comparison and the choice.

**Both engines completed a real campaign with no source compromise.** Neither needed `session.ts`, `session.test.ts`, the root `vitest.config.ts`, any tsconfig, or the ADR 0061 TypeScript bridge to be touched. That criterion did not separate them, so the decision came down to the priority order the issue set.

## The comparison, in the issue's priority order

| # | Axis | StrykerJS 10.0.0 | mewt 4.0.0 | Winner |
|---|---|---|---|---|
| 1 | Vitest correctness | Runs the real test file through the real root config in a sandbox copy; dry run reports exactly 17 tests, matching plain `vitest run`. **Defect: two `static: true` mutants reported Survived that in fact fail tests when applied by hand (17/17 and 3/17 respectively).** | Shells out to the real command; baseline saw `17 passed (17)`; aliases resolve. **Defects: a compile error is scored as a kill, and timeouts are dropped from the score entirely.** | **Stryker** |
| 2 | TS 7 / TS 6 toolchain | Unaffected with `checkers: []` — instruments with Babel, never type-checks. `typescript-checker` works only *because* the bridge points `typescript` at TS 6, and is excluded. | Provably indifferent: own tree-sitter grammar, never loads the `typescript` package, parses the file in a bare directory with no `node_modules` at all. | mewt |
| 3 | Mutant targeting | File and `:startLine[:startCol]-endLine[:endCol]` ranges, composable, verified as 1 of 901 files with no leak. | File and directory targeting precise and leak-free; sub-file is a two-step `print mutants --line` → `test --ids`, and `--line` over-matches on spans. | **Stryker** |
| 4 | Report usefulness | Mutator, `file:line:col`, `-`/`+` diff, **and the names of the covering tests**, plus a per-test kill count that showed five of 17 tests killing nothing. Standard elements JSON, self-contained HTML. | Status, operator, line, original vs mutated, full test output, JSON and SARIF. **No coverage mapping at all** — triage is unaided reasoning from the diff. | **Stryker** |
| 5 | Runtime | 98 mutants in **35–40s** at 7-way parallelism, deterministic across runs. | **No parallelism, structurally.** 117 mutants took 17.5–26.6 min while silently dropping 17–33% as unscored timeouts; ~12–13 min projected after tuning vitest's own `testTimeout`. | **Stryker** |
| 6 | Configuration burden | Short config, but five failed runs to discover four repo-specific settings. | Twelve lines of TOML, no npm dependency, no plugins. | mewt |

Stryker takes the highest-priority axis and three of the remaining four. mewt takes axis 2 — but the configuration actually shipped runs `checkers: []`, where the bridge never enters the picture either, so that win has no practical consequence here. mewt takes axis 6 outright.

## Why the correctness defects are not symmetric

Both engines lie. They lie in opposite directions, and only one direction is survivable for a tool whose entire job is finding gaps.

Stryker's defect produces a **false survivor**: it reports a gap that is not there. The spike falsified it by hand — applying the mutation to the real source fails tests that Stryker reported as passing — and traced it to activation delivery for static mutants in the vitest runner. It is confined to `static: true` mutants, it is visible in the report (`"static": true`, `"coveredBy": []`), and the cost of it is a reviewer's wasted half hour.

mewt's defects produce **false kills**: they hide gaps. A mutant that breaks the build collects zero tests, exits non-zero, and is scored as caught — there is no status distinguishing a failed assertion from a failed compile. Separately, timeouts are excluded from the numerator *and* the denominator, so on this async state machine between 17% and 33% of the corpus vanished from the score depending on one config value. Neither is detectable from the report, and neither has a flag.

A diagnostic that over-reports gaps wastes time. One that under-reports them, silently, is worse than not running it.

## The decision that settled it

mewt rewrites the tracked source file **in place, in the real working tree**, for the duration of each mutant's test run. The spike caught a live mutation in `git diff` and accidentally copied out a mutated file mid-campaign. This repo's own instructions say a dev server is usually already running on `:5173`, owned by the human, hot-reloading — a tool that hot-swaps mutated source into that checkout is not a tool that can live here. It is also the reason mewt cannot parallelise and never will.

Two further facts, recorded but not load-bearing: mewt is AGPL-3.0, and the project is nine months old with 54 stars. Neither would have decided this on its own.

## What was retained

- `@stryker-mutator/core` and `@stryker-mutator/vitest-runner`, both `10.0.0`, as root devDependencies.
- `stryker.conf.mjs` — the shared engine settings, with every load-bearing knob carrying the reason it is set. `.mjs` rather than `.json` precisely so those reasons can be written down.
- `pnpm mutate:session` and `pnpm mutate:graph` in `package.json`, each pairing a `--mutate` target with the `--testFiles` that are its oracle. Issue `01` asks for *a* command and there are two: `mutate:graph` was written here for issue `04`'s control, ahead of the campaign that exercised it, and it went unrun until then. Recorded rather than tidied away — the second command is `04`'s, landing in `01`'s commit.
- `@stryker-mutator/api` is a devDependency for the one type annotation in `stryker.conf.mjs`. It arrives transitively with `core`, but pnpm's non-flat layout means an undeclared package does not resolve from the root, and an annotation that resolves to nothing claims a checking that is not happening.
- `/.stryker-tmp/` and `/reports/` added to `.gitignore`, `.prettierignore`, `eslint.config.js` and `.oxlintrc.json`. All four, because none of them reads any of the others: flat ESLint config does not read `.gitignore`, and `.oxlintrc.json` mirrors ESLint's list by hand. Rooted, because Stryker only writes them beside the config and a bare `reports/` would match the name at any depth.

**Not retained, deliberately:** `@stryker-mutator/typescript-checker`. It ran cleanly on the TS 6 bridge and then rejected 56 of 98 mutants as `CompileError` — 10 of the 11 survivors among them — raising the reported score from 88.78% to 97.62% by deleting the signal, at 3.4× the runtime. It is welded to the half of the bridge ADR 0061 slates for removal.

**Removed completely:** both spike worktrees and their branches, mewt's contained 25 MB binary (it went with its worktree; `~/.config/mewt` was never created and `which mewt` finds nothing), the `mewt.toml`, the SQLite campaign store, and every report either engine produced.

## Five settings that exist only because of this repo

Each was found by a failed run, and none of the failures pointed at its own fix. They are the configuration burden, and they are written into `stryker.conf.mjs` with their reasons.

1. `plugins` must name `@stryker-mutator/vitest-runner` explicitly — the default glob does not resolve through pnpm's non-flat `node_modules`.
2. `ignorePatterns` must exclude `.claude/**` and `.worktrees/**` — the git-tracked *directory* symlinks under `.claude/skills/` make the sandbox copier die with `ENOTSUP … copyfile`, and a git worktree is a full checkout that would otherwise be copied whole into the sandbox. Both directories have held worktrees, so ignoring one covers only that one.
3. `vitest.related` must be `false` — vitest's related mode throws on the `import.meta.glob(…, { query: '?raw' })` markdown fixtures. Plain `vitest related` reproduces it, so no Stryker upgrade fixes it.
4. `testFiles` must be named per campaign — the full suite cannot run in the sandbox, because `test/unit`'s repo-meta test shells out to `git ls-files` and gets `[]` from a plain directory copy.
5. `cleanTempDir` must be `'always'`, not the `true` default — `true` removes the sandbox only after a *successful* run, and settings 1, 2 and 4 each describe a way a run dies. A surviving sandbox is a complete repo copy carrying its own `tsconfig.json`, which makes `eslint` report a parse error for every file in the repository and breaks the next `pnpm verify`.

## Standing limits on what the number means

- **Never a gate.** `thresholds.break` is `null`, it is absent from `verify` and from CI, and no score is a target.
- **`static: true` survivors must be checked by hand.** The cause is upstream and named: with a `testFiles` filter in play — which this repo cannot avoid, per setting 4 above — Stryker's planner picks runtime activation, and Vitest activates the mutant only after the importing module has loaded, so a *covered* static mutant is scored Survived. stryker-mutator/stryker-js#6145 ("fix(core): activate static mutants before module load") is the fix and was **still open** when this was written, so this is standing practice rather than a wait for the next upgrade. On `session.ts` two of eleven survivors are false for this reason. **How much they fail by is not a usable signal**: one fails 17/17 tests, the other only 3/17, so "it would fail everything" is not the detection heuristic — `"static": true` with an empty `coveredBy` is. See `baseline-space-session.md`, which established this by falsifying both rather than inheriting the spike's single data point. The graph control confirms the heuristic on a second target: `space.ts` has exactly one `static: true` mutant, it is a false survivor (hand-run fails 53 of 99), and its nine fellow empty-`coveredBy` entries are all genuine `NoCoverage` — a different status, never run rather than run-and-not-activated. Measured tax so far: 2 of 98 mutants on one target, 1 of 148 on the other.
- **The score is a score for the *named oracle*, not for the repository, and a survivor is not yet a gap.** Because `testFiles` is mandatory (below), the engine is structurally incapable of telling you that the wider suite already kills a mutant. On `packages/graph/src/space.ts` six of sixteen survivors are killed by `test/unit/read-single-space.test.ts` and its neighbours — a six-mutant understatement of the repo's real oracle, and six tests that would have been written into the wrong file. **Hand-apply a survivor and run `pnpm test` before classifying it as a category-1 gap**; that run is what separates category 1 from category 3. See `graph-control-and-adoption.md`.
- A repo-wide campaign is **not** currently possible: it would need every git-shelling repo-meta test excluded, or `--inPlace`, which is untested and carries its own safety problem.
- Everything measured here is macOS, single machine. CI behaviour is unverified, and there is no reason to verify it while this stays a local tool.
