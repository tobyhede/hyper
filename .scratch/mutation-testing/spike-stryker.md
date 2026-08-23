# StrykerJS spike — findings

Run in the disposable worktree `/Users/tobyhede/psrc/hyper/.worktrees/mutation-spike-stryker`
(branch `spike/mutation-stryker`), macOS darwin 25.4.0, 8 CPUs, Node v24.18.1, pnpm 9.15.0.
All raw logs are under that worktree's `.spike/` (deleted with the worktree).

## Versions and install

```
cd /Users/tobyhede/psrc/hyper/.worktrees/mutation-spike-stryker
pnpm install --frozen-lockfile            # Done in 5.8s
pnpm add -D -w @stryker-mutator/core@latest @stryker-mutator/vitest-runner@latest
pnpm add -D -w @stryker-mutator/typescript-checker@latest   # step 2 only
```

Installed:

| package | version | declared peers |
|---|---|---|
| `@stryker-mutator/core` | 10.0.0 | none |
| `@stryker-mutator/vitest-runner` | 10.0.0 | `@stryker-mutator/core: 10.0.0`, `vitest: >=2.0.0` |
| `@stryker-mutator/typescript-checker` | 10.0.0 | `@stryker-mutator/core: 10.0.0`, `typescript: >=3.6` |
| (transitive) `@stryker-mutator/api`, `instrumenter`, `util` | 10.0.0 | — |

110 packages added for core+vitest-runner, 1 more for the checker.

**Peer-dep resolution against vitest 2.1.9 and Node 24: clean.** `vitest: >=2.0.0` is
satisfied by the repo's 2.1.9; `@stryker-mutator/vitest-runner` declares
`engines.node: >=22.0.0`. pnpm printed **no** peer warning naming any Stryker package.

The only peer warning printed by either `pnpm add` is pre-existing and belongs to the
TS bridge, not to Stryker:

```
 WARN  Issues with peer dependencies found
packages/app
└─┬ @ladle/react 5.1.1
  └─┬ vite-tsconfig-paths 5.1.4
    └─┬ tsconfck 3.1.6
      └── ✕ unmet peer typescript@^5.0.0: found 6.0.2
```

Also printed each time (pre-existing): `WARN 3 deprecated subdependencies found:
glob@10.5.0, tsconfck@3.1.6, whatwg-encoding@3.1.1`.

## Configuration required

Final working config, verbatim — `stryker.session.config.json` at the repo root
(a new, Stryker-only file; nothing existing was edited):

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "pnpm",
  "testRunner": "vitest",
  "vitest": {
    "configFile": "vitest.config.ts",
    "related": false
  },
  "checkers": [],
  "mutate": [
    "packages/persistence/src/session.ts"
  ],
  "coverageAnalysis": "perTest",
  "reporters": [
    "clear-text",
    "progress",
    "html",
    "json"
  ],
  "timeoutMS": 20000,
  "tempDirName": ".stryker-tmp",
  "ignorePatterns": [
    ".claude/**"
  ],
  "plugins": [
    "@stryker-mutator/vitest-runner"
  ],
  "testFiles": [
    "packages/persistence/test/session.test.ts"
  ]
}
```

CLI flags used:

```
node_modules/.bin/stryker run stryker.session.config.json --dryRunOnly --logLevel info
node_modules/.bin/stryker run stryker.session.config.json --logLevel info
node_modules/.bin/stryker run <cfg> --cleanTempDir false --logLevel warn     # to inspect the sandbox
```

Four of the eight settings above exist **only** because of specific properties of this
repo, and each was found by a failed run, not by reading docs:

1. `"plugins": ["@stryker-mutator/vitest-runner"]` — **required under pnpm.** The default
   `plugins: ["@stryker-mutator/*"]` glob does not find the runner through pnpm's
   non-flat `node_modules`. Without it:
   `Cannot find TestRunner plugin "vitest". In fact, no TestRunner plugins were loaded.
   Did you forget to install it?` — plus a spurious
   `WARN OptionsValidator Unknown stryker config option "vitest"`, which disappears once
   the plugin is listed.
2. `"ignorePatterns": [".claude/**"]` — **required by this repo's tracked symlinks.**
   `.claude/skills/shadcn` and `.claude/skills/shadcn-first-ui` are git-tracked symlinks
   to *directories* under `.agents/skills/` (deliberate, per CLAUDE.md). Stryker's sandbox
   copier uses `fs.copyFile`, which on macOS dies on them:
   `Error: ENOTSUP: operation not supported on socket, copyfile
   '…/.claude/skills/shadcn' -> '…/.stryker-tmp/sandbox-21u1EW/.claude/skills/shadcn'`
   This kills the run before instrumentation output is even used.
3. `"vitest": { "related": false }` — **required.** See §1.
4. `"testFiles": [...]` — **required.** See §1.

Configuration burden, honestly: the file itself is short and every knob is documented, but
getting to it took **five failed runs**, each failing on a different repo-specific hazard,
and none of the failures pointed at its own fix. The pnpm plugin-glob failure and the
symlink `ENOTSUP` are generic Stryker roughness; the `related`/`testFiles` pair is a
genuine and non-obvious interaction with this repo's suite. Someone who has not done this
before will spend an afternoon, not ten minutes. Once written, the config is stable and
the runs are deterministic (two identical full campaigns, byte-identical results).

## 1. Vitest correctness

**Yes, with two caveats that had to be configured around; after that the oracle is exact.**

- Stryker did execute the real `packages/persistence/test/session.test.ts` through the
  real root `vitest.config.ts` (`vitest.configFile: "vitest.config.ts"`), not a copy or a
  rewrite. It runs it against a *sandbox copy* of the whole repo under
  `.stryker-tmp/sandbox-XXXXXX/`, with root `node_modules` symlinked in.
- **Alias resolution survived.** The root config resolves `@project/*` with
  `fileURLToPath(new URL('./packages/…', import.meta.url))`, which is relative to the
  config file, so inside the sandbox the aliases point at the *sandbox's* packages. The
  test's own `import … from '../src/index'` is relative and likewise lands on the mutated
  copy. Nothing had to be added for this.
- **The dry run reports exactly 17 tests, matching plain `vitest run`:**
  `INFO DryRunExecutor Initial test run succeeded. Ran 17 tests in 0 seconds
  (net 9.54ms, overhead 409.46ms).` The clear-text report then names all 17 individually
  with their kill counts, and the JSON report's `testFiles` block lists 17 test ids for
  the one file. No test silently failed to collect.

The two caveats, both about running the *whole* suite rather than the one file:

**(a) `vitest.related` (Stryker's default `true`) is unusable in this repo.** Stryker's
vitest runner narrows tests with vitest's related mode. That mode crashes on this repo's
`import.meta.glob(..., { query: '?raw' })` markdown fixtures:

```
Error: Failed to parse source for import analysis because the content contains invalid JS
syntax. You may need to install appropriate plugins to handle the .md file format, or if
it's an asset, add "**/*.md" to `assetsInclude` in your configuration.
```

This is **not** a Stryker bug — plain vitest reproduces it with no Stryker involved:

```
$ pnpm exec vitest related packages/persistence/src/session.ts --run
 RUN  v2.1.9 …
⎯⎯⎯⎯⎯⎯ Unhandled Error ⎯⎯⎯⎯⎯⎯⎯
Error: Failed to parse source for import analysis … .md file format …
6  |  Card **A** is the entry point of the first collection.
```

The two offenders are `packages/app/test/space-files.test.ts` and
`packages/app/test/fixture-placement.test.ts`. Fix: `"related": false`.

**(b) The full suite cannot run inside Stryker's sandbox at all.** With `related: false`
and no `testFiles`, the initial run executes every test file and one repo-meta test fails,
because the sandbox is a plain directory copy and not a git repository:

```
ERROR DryRunExecutor One or more tests failed in the initial test run:
	the retired domain vocabulary is gone from tracked files reaches the kinds of file the rename actually touched
		expected [] to include 'AGENTS.md'
ConfigError: There were failed tests in the initial test run.
```

(`git ls-files` returns `[]` in the sandbox.) Fix for this spike:
`"testFiles": ["packages/persistence/test/session.test.ts"]`, which is what we want
anyway. But note the consequence: **a repo-wide Stryker campaign would need every
git-shelling repo-meta test excluded**, or `--inPlace` (untested here).

## 2. TypeScript 7 / TypeScript 6 toolchain compatibility

Bridge state confirmed unchanged throughout:

```
$ node -e "console.log(require('typescript').version)"   → 6.0.3
$ node_modules/.bin/tsc  --version                       → Version 7.0.2
$ node_modules/.bin/tsc6 --version                       → Version 6.0.3
```

(`pnpm ls` reports the dependency as `typescript <- @typescript/typescript6 6.0.2`; the
package's own `ts.version` string says 6.0.3.)

**Without `typescript-checker` (`checkers: []`): completely unaffected.** Stryker never
type-checks; it instruments with Babel and prepends `// @ts-nocheck` to the sandbox copies
(`disableTypeChecks` defaults to `true`). The bridge is irrelevant to that path.

**With `@stryker-mutator/typescript-checker` (`checkers: ["typescript"]`,
`tsconfigFile: "tsconfig.json"`): it ran, cleanly, and produced no error text at all.**
This was the surprise of the spike. `require('typescript')` hands the checker TypeScript
**6.0.3**, whose `createProgram` API is exactly what the bridge exists to keep alive, so
the checker gets what it wants. Stryker even records it in the report metadata:
`"dependencies": {"typescript": "6.0.2"}`. Zero warnings, zero errors in the log.

What it *did* is the problem, and it is a design consequence rather than a crash — see §3
and §4: the checker rejected **56 of 98 mutants (57%) as `CompileError`**, including
**10 of the 11 survivors**, lifting the reported score from 88.78% to 97.62% by deleting
most of the signal. Under this repo's `tsconfig.base.json` that is arguably *correct*
— `allowUnreachableCode: false` makes `if (false) return;` a compile error, and the
discriminated `persistence` union makes `{ kind: "" }` and `{}` compile errors — but the
number it produces answers a different question from the one the survivors were asking.

Nothing required touching the bridge. Standing caveat: the checker is structurally pinned
to the **TypeScript 6** compatibility compiler, i.e. to exactly the half of the bridge
ADR 0061 declares non-normative and slates for removal. When the bridge goes, this checker
goes with it unless upstream has moved to the TS7 API by then. Whether TS7 would agree
with TS6 on all 56 rejections was **not determined** (TS7 exposes no `createProgram`, so
there is no way to run the checker against it).

## 3. Mutant targeting

**Precise, and it did not leak.**

Whole file:

```json
"mutate": ["packages/persistence/src/session.ts"]
```

```
INFO ProjectReader Found 1 of 901 file(s) to be mutated.
INFO ProjectReader Found 1 test file(s) matching --testFiles patterns.
INFO Instrumenter Instrumented 1 source file(s) with 98 mutant(s)
```

The JSON report's `files` key contains exactly one entry,
`packages/persistence/src/session.ts`. No other file or package was mutated.

Line/column ranges work too, with the `path:startLine[:startCol]-endLine[:endCol]` suffix,
and multiple ranges compose. `startCommit` + `submit` only:

```json
"mutate": [
  "packages/persistence/src/session.ts:78-130",
  "packages/persistence/src/session.ts:146-157"
]
```

```
INFO Instrumenter Instrumented 1 source file(s) with 51 mutant(s)
All files   | 100.00 |  100.00 |       51 |         0 |          0 |        0 |        0 |
INFO MutationTestExecutor Done in 23 seconds.
```

(Both of those functions are fully covered — 51/51 killed. The gaps are elsewhere.)

**98 mutants for the 190-line `session.ts`, by kind:**

| mutator | count |
|---|---|
| ConditionalExpression | 26 |
| StringLiteral | 18 |
| ObjectLiteral | 18 |
| BlockStatement | 13 |
| EqualityOperator | 9 |
| LogicalOperator | 5 |
| CallExpression | 4 |
| BooleanLiteral | 3 |
| ArrowFunction | 2 |

## 4. Report usefulness

Four reporters were exercised: `clear-text`, `progress`, `html`, `json`.

**Per survivor you get:** mutator name, `file:line:column`, a one-line `-`/`+` diff of the
original against the mutated source, and the *names* of the tests that covered it. Plus,
above the survivor list, a per-test line for all 17 tests with how many mutants each one
killed (`killed N`) or merely covered (`covered N`) — that second number is unusually
useful: five of the 17 tests killed nothing at all.

One real survivor, verbatim from `.spike/campaign-2.txt`:

```
[Survived] ConditionalExpression
packages/persistence/src/session.ts:177:11
-         if (state.persistence.kind !== 'conflicted' || inFlight) return;
+         if (false || inFlight) return;
Tests ran:
    openSpaceSession queues an Edit submitted from a pending notification raised inside a conflicted one
    openSpaceSession commits an explicitly reconciled conflict against the returned current revision
    openSpaceSession carries the reconciled working snapshot into the commit it starts
```

**Can you tell what behaviour is unasserted? Yes, directly.** Line 177 is
`resolveConflict`'s guard. Deleting the `kind !== 'conflicted'` half changes nothing, so no
test calls `resolveConflict` from a non-conflicted state — the guard's *refusal* is
unproven. The same block yields two more with the same reading (`&& inFlight`, and the full
`if (false)`), and two at 185:22/185:30 showing that `persistence: { kind: 'conflicted',
current }` on the intermediate resolved state can be replaced with `{}` or `{ kind: "" }`
undetected — the intermediate state's persistence kind is never asserted. Line 165 gives
the identical reading for `retry`. That is four concrete, actionable test gaps out of nine
real survivors, legible without opening the source.

The JSON report is the standard `mutation-testing-elements` schema (`schemaVersion`,
`files[].source`, `files[].mutants[]`, `testFiles[].tests[]`, `thresholds`, `config`,
`framework`), so it is machine-consumable and dashboard-compatible. Per mutant:

```json
{
  "id": "89",
  "mutatorName": "ConditionalExpression",
  "replacement": "false",
  "status": "Survived",
  "static": false,
  "testsCompleted": 2,
  "coveredBy": ["11", "14"],
  "location": { "start": { "line": 165, "column": 11 },
                "end":   { "line": 165, "column": 50 } }
}
```

`coveredBy`/`killedBy` are test **ids** resolved against the `testFiles` block; the full
file `source` is embedded, so a consumer can render the diff itself.

The HTML report (`reports/mutation/mutation.html`, 309 KB) is the
`mutation-testing-elements` web-component viewer, **fully self-contained** — the script is
inlined, `grep -c cdn` returns 0 and there is no external `src=`. It renders the annotated
source with mutants filterable by status and a drill-down per mutant.

Verdict on the reports: **genuinely useful, best-in-class of the JS mutation tooling.**
The one thing missing per survivor is which *assertion* would have caught it, which no
engine provides.

### The one serious correctness defect: false survivors on static mutants

Two of the eleven reported survivors are **wrong**. Both are `"static": true` with
`"coveredBy": []`:

```
[Survived] ArrowFunction
packages/persistence/src/session.ts:33:15
-   const clone = <T>(value: T): T => structuredClone(value);
+   const clone = () => undefined;
Ran all tests for this mutant.

[Survived] ArrowFunction
packages/persistence/src/session.ts:35:31
-   const hasChangedSinceExport = ( … ): boolean => exportedRevision === null || …
+   const hasChangedSinceExport = () => undefined;
Ran all tests for this mutant.
```

Hand-applying the first mutation to the real source kills **all 17 tests**:

```
$ # session.ts:33 → const clone = <T>(value: T): T => undefined as unknown as T;
$ pnpm exec vitest run packages/persistence/test/session.test.ts
 Test Files  1 failed (1)
      Tests  17 failed (17)
```

(source restored immediately; `git diff` on `session.ts` is empty and the file passes 17/17
again.)

The instrumentation itself is fine. Keeping the sandbox (`--cleanTempDir false`) shows the
switch sitting at module-evaluation position, which is why Stryker classifies it static:

```js
// .stryker-tmp/sandbox-4MF19c/packages/persistence/src/session.ts:87
const clone = stryMutAct_9fa48("0") ? () => undefined : (stryCov_9fa48("0"), (() => {
  const clone = <T,>(value: T): T => structuredClone(value);
```

and forcing activation through the instrumenter's env-var fallback, in that same sandbox,
kills everything as it should:

```
$ cd .stryker-tmp/sandbox-0J7sdM
$ __STRYKER_ACTIVE_MUTANT__=0 …/node_modules/.bin/vitest run packages/persistence/test/session.test.ts
 Test Files  1 failed (1)
      Tests  17 failed (17)
```

So the failure is in `@stryker-mutator/vitest-runner`'s *activation delivery* for static
mutants (`ns.activeMutant` is set from `inject('activeMutant')` in Stryker's setup file,
and evidently is not in force when the mutated module body evaluates). Reproduced with
`coverageAnalysis` set to `perTest`, `all` **and** `off`, and with
`maxTestRunnerReuse: 1` — none of them fixes it.

Consequences: the honest score for `session.ts` is **89/98 = 90.82%**, not the reported
88.78%; and, worse than the number, **`static: true` results cannot be trusted in either
direction**. `"ignoreStatic": true` is a clean mitigation — it drops static mutants from
the score entirely rather than lying about them (verified on the 33–38 range: 7 mutants
become 6 killed / 1 survived, 85.71%, with the two false survivors gone) — at the cost of
never testing module-scope code. Enabling `typescript-checker` also happens to hide both,
by rejecting them as compile errors, which is luck rather than a fix.

## 5. Runtime

| measurement | value |
|---|---|
| Plain `vitest run packages/persistence/test/session.test.ts` | 890 ms / 858 ms / 600 ms reported duration; **2.94 s / 1.64 s / 1.53 s wall** over three runs (first is cold) |
| Stryker dry run (`--dryRunOnly`), 17 tests | **3.38 s wall** |
| Full campaign, 98 mutants, no checker, run 1 | **40.06 s wall** ("Done in 39 seconds") |
| Full campaign, 98 mutants, no checker, run 2 | **36.35 s wall** ("Done in 35 seconds") |
| Range campaign (`startCommit`+`submit`), 51 mutants | **23.75 s wall** ("Done in 23 seconds") |
| Full campaign **with** `typescript-checker`, 98 mutants | **2 m 17.6 s** and **1 m 58.7 s** wall over two runs |

Concurrency was Stryker's default on an 8-CPU machine: `Creating 7 test runner process(es)`
without a checker, `Creating 4 checker process(es) and 3 test runner process(es)` with one.
`--maxTestRunnerReuse` was never needed for performance.

Derived per-mutant cost, no checker: `(36.35 s − ~4 s fixed startup+dry-run) / 98 mutants`
≈ **0.33 s per mutant wall-clock at 7-way parallelism** (≈2.3 s of serial test time per
mutant). Stryker reports `Ran 3.37 tests per mutant on average` — `coverageAnalysis:
perTest` is doing real work: 98 × 3.37 = 330 test executions instead of 98 × 17 = 1666.

With the checker, the picture changes shape rather than just scale: ~34 s of checker
startup (`11:39:55` instrumented → `11:40:29` dry run begins), then 56 mutants are rejected
without ever running tests and only 42 reach the runner (`Ran 1.59 tests per mutant`).
Net ≈3.4× slower for a smaller tested set.

**Extrapolation:** no extrapolation is needed for `session.ts` — the *full* 98-mutant
campaign was run, twice, and finishes in **under 40 seconds**. A ~30-minute budget is
roughly **45× more than enough**; even with `typescript-checker` it is ~13× more than
enough. Scaling naively at 0.33 s/mutant, 30 minutes buys on the order of **5,000
mutants**, which at this file's density (98 mutants / 190 lines ≈ 0.52 per line) is
~10,000 lines of source — i.e. the whole of `packages/persistence/src` plus `core` and
`graph` would plausibly fit, *if* the sandbox/full-suite problems in §1(b) were solved.
That last conditional is the real risk, not CPU time.

## 6. Source compromises required

**None.**

`git status` at the end of the spike:

```
 M package.json          (+3 lines: the three @stryker-mutator devDependencies)
 M pnpm-lock.yaml        (+1125 lines)
?? .spike/               (my own logs)
?? reports/              (Stryker's output)
?? stryker.session.config.json
```

- `packages/persistence/src/session.ts` — **unmodified.** It was patched once, deliberately,
  to falsify Stryker's "Survived" claim on mutant 0 (§4), then restored from a copy;
  `git diff` on it is empty and it passes 17/17.
- `packages/persistence/test/session.test.ts` — **untouched.**
- Root `vitest.config.ts` — **untouched.** Stryker consumed it as-is.
- `tsconfig.json` / `tsconfig.base.json` — **untouched.** No strictness loosened.
- The TypeScript 6/7 bridge in `package.json` — **untouched.** No `typescript` override
  added. Verified after the fact: `tsc` = 7.0.2, `tsc6` = 6.0.3,
  `require('typescript')` = 6.0.3.
- No lint rule disabled; `.oxlintrc.json` and the eslint config untouched.
- `stryker.session.config.json` is a new Stryker-only file, explicitly not a compromise.

Two things that *look* like compromises and are not, but should be understood before
shipping:

1. Stryker prepends `// @ts-nocheck` to every sandbox source copy
   (`disableTypeChecks` default `true`). **Sandbox only** — the real tree is never written.
   It is the reason 56 type-invalid mutants still executed in the no-checker campaign.
2. `"testFiles"` restricting the oracle to one file is a deliberate scoping choice for this
   spike, not a workaround for a broken test — but §1(b) shows it is *also* load-bearing,
   because the full suite genuinely cannot run in the sandbox.

## Blockers and caveats

- **False survivors on static mutants (§4).** The most serious finding. Two of 98 mutants
  here; the ratio will differ per file, and any file with meaningful module-scope logic
  will report more. An engine that reports a killed mutant as survived costs reviewer trust
  the first time someone chases a phantom gap. Mitigable with `ignoreStatic: true`, at the
  price of never testing module-scope code.
- **The full test suite cannot run inside the Stryker sandbox.** `test/unit`'s repo-meta
  test shells out to `git ls-files` and gets `[]`. Any repo-wide campaign must exclude those
  tests, or run `--inPlace` (not attempted — it mutates the working tree, which needs its
  own safety story).
- **`vitest.related` must stay off** while `import.meta.glob({ query: '?raw' })` markdown
  fixtures exist, which costs the automatic per-mutant test narrowing. `coverageAnalysis:
  perTest` recovers most of that benefit, but only for files whose tests are already
  identified by `testFiles`. A repo-wide config therefore needs a maintained
  `mutate`↔`testFiles` mapping.
- **Two pnpm/repo-shape papercuts** that will recur on any machine: the plugin glob
  (`plugins` must be explicit) and the tracked directory symlinks under `.claude/`
  (`ignorePatterns` must exclude them). Both are one-liners once known.
- **`typescript-checker` is welded to the TS6 half of the bridge.** It works today
  precisely because ADR 0061 keeps `typescript` pointing at `@typescript/typescript6`.
  When the bridge is removed, this plugin stops working unless upstream has migrated.
- **Not determined:** whether TypeScript 7 would agree with TypeScript 6 on all 56
  `CompileError` classifications (no TS7 `createProgram` to test against);
  `--inPlace` behaviour; `incremental` mode; behaviour under CI (Linux, different CPU
  count); behaviour on a jsdom/React test file; whether the static-mutant defect is fixed
  on any newer runner build.
- Everything above is macOS-only and single-machine. CI behaviour is unverified.

## Verdict in one paragraph

I would ship StrykerJS for this repo, scoped — as an opt-in, per-file campaign over the
pure-domain packages, driven by a checked-in Stryker-only config with `ignoreStatic: true`
and `checkers: []`, and explicitly **not** as a repo-wide `verify` gate. The single
strongest argument for it is that it *worked, fast, and honestly*: 98 mutants over a
190-line state machine in 36 seconds against the real `session.test.ts` through the real
root `vitest.config.ts` with no source compromise whatsoever, and the report it produced
named four concrete unasserted behaviours (`resolveConflict`'s and `retry`'s refusal
guards, and the intermediate resolved state's `persistence.kind`) in a form a reviewer can
act on without reading the source. The single strongest argument against it is that it
reported two mutants as *Survived* that in fact kill every test in the file — a silent
correctness defect in the vitest runner's static-mutant activation, which I had to falsify
by hand — and an engine whose green-vs-red you must spot-check by hand is an engine whose
number you cannot put in a ratchet; add to that a sandbox that cannot run this repo's own
test suite, and the honest position is that Stryker earns a place as a periodic diagnostic
tool here, not as a gate.
