# mewt spike — findings

Spike worktree: `/Users/tobyhede/psrc/hyper/.worktrees/mutation-spike-mewt` (branch `spike/mutation-mewt`), now disposable.
Date run: 2026-08-22. Platform: darwin 25.4.0, arm64.

## Versions and install

- **mewt 4.0.0** (`mewt --version` → `mewt 4.0.0`), artifact `aarch64-apple-darwin`.
- Installer is **cargo-dist 0.31.0**. I downloaded and read it before running it (1486 lines). It honours three relevant env vars, read out of the script itself:
  - `MEWT_INSTALL_DIR` / `CARGO_DIST_FORCE_INSTALL_DIR` → "cargo-home" layout, installs to `$DIR/bin`, **still writes an update receipt** to `${XDG_CONFIG_HOME:-$HOME/.config}/mewt/mewt-receipt.json`.
  - `MEWT_UNMANAGED_INSTALL` → "flat" layout, and it *also* forces `NO_MODIFY_PATH=1` and `INSTALL_UPDATER=0`, which suppresses the receipt entirely. This is the fully contained option.
  - `--no-modify-path` is **deprecated** in this installer; it prints `--no-modify-path has been deprecated; please set MEWT_NO_MODIFY_PATH=1 in the environment`. Use the env var.
- Exact install command used:

  ```sh
  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/trailofbits/mewt/releases/latest/download/mewt-installer.sh \
    -o /tmp/mewt-installer.sh
  # (read it, then:)
  MEWT_UNMANAGED_INSTALL="$W/.mewt-bin" MEWT_NO_MODIFY_PATH=1 MEWT_DISABLE_UPDATE=1 \
    sh /tmp/mewt-installer.sh
  ```

  Output: `downloading mewt 4.0.0 aarch64-apple-darwin` / `installing to .../.mewt-bin` / `everything's installed!`. One 25 MB file: `.mewt-bin/mewt`.

- **Containment worked completely.** I sha1-snapshotted `~/.profile ~/.bashrc ~/.bash_profile ~/.bash_login ~/.zshrc ~/.zshenv ~/.config/fish/conf.d/mewt.env.fish ~/.config/mewt/mewt-receipt.json` before and after; `diff` was empty (`NO CHANGES OUTSIDE WORKTREE`). `~/.config/mewt` was never created. A `find` over `~/Library/Application Support`, `~/Library/Caches`, `~/.config`, `~/.local`, `~/.cache` for `*mewt*` returned nothing. No `~/.cargo` involvement.
- **Uninstall command** (nothing else is needed, and deleting the worktree does all of it):

  ```sh
  rm -rf /Users/tobyhede/psrc/hyper/.worktrees/mutation-spike-mewt/.mewt-bin \
         /Users/tobyhede/psrc/hyper/.worktrees/mutation-spike-mewt/.mewt-spike \
         /Users/tobyhede/psrc/hyper/.worktrees/mutation-spike-mewt/mewt.toml
  ```

- **Licensing: AGPL-3.0.** `trailofbits/mewt` is AGPL-3.0 (confirmed from `LICENSE` and the GitHub API). Running it as an external binary over the source does not make this repo AGPL, but it is a stricter licence than a build tool usually carries and is worth a deliberate decision rather than a default.

## Configuration required

Final `mewt.toml`, verbatim, at the worktree root:

```toml
db = ".mewt-spike/mewt.sqlite"

[log]
level = "info"

[targets]
include = ["packages/persistence/src/session.ts"]
ignore = ["node_modules", "dist", ".worktrees"]

[test]
cmd = "pnpm exec vitest run packages/persistence/test/session.test.ts"
timeout = 60
```

CLI flags used across the spike:

```sh
mewt --version
mewt --help ; mewt {run,mutate,results,print,status,test} --help
mewt print mutations --language javascript
mewt mutate                                     # enumerate only
mewt print mutants                              # table
mewt print mutants --format ids
mewt print mutants --severity {high,medium,low} --format ids
mewt print mutants --line 160 [--format ids]
mewt print mutant --id 14                       # whole mutated file to stdout
mewt run --verbose                              # campaign, streams baseline output
mewt run                                        # resume: tests untested mutants only
mewt run --test.timeout 10
mewt run packages/persistence/src/session.ts --db .mewt-spike/clean.sqlite --test.timeout 10
mewt test --ids 15 --test.timeout 300 --db .mewt-spike/clean.sqlite
mewt test --ids 15 --test.timeout 120 --test.cmd "pnpm exec vitest run packages/persistence/test/session.test.ts --testTimeout=300"
mewt status [--db ...]
mewt results [--all] [--id N] [--verbose] [--format table|ids|json|sarif]
mewt print config --format json
```

**Configuration burden: very low.** Twelve lines of TOML, written once, no plugins, no runner adapter, no npm dependency, no `package.json` change. `mewt.toml` is found by walking up from cwd, and `--config` re-roots the working directory. Everything in the file has a CLI override in dotted form (`--test.cmd`, `--test.timeout`, `--db`), which made per-experiment variation trivial. The only setting that needed real thought was `[test].timeout`, and getting it wrong silently changes the reported score (see §5). There is no config knob at all for parallelism, for treating a timeout as a kill, or for marking a mutant equivalent.

## 1. Vitest correctness

**Yes — mewt executed the real `session.test.ts` through the real root `vitest.config.ts`, and alias resolution survived.**

Evidence. mewt runs a baseline before every campaign and, with `--verbose`, streams it:

```
 Running baseline test to ensure tests pass before applying mutations...

  RUN  v2.1.9 /Users/tobyhede/psrc/hyper/.worktrees/mutation-spike-mewt

  ✓ packages/persistence/test/session.test.ts (17 tests) 28ms

  Test Files  1 passed (1)
       Tests  17 passed (17)
 Baseline test passed successfully!
 Starting mutation campaign with 1 targets (117 untested mutants)
```

That is byte-for-byte the same shape as a plain `pnpm exec vitest run packages/persistence/test/session.test.ts` (`17 passed (17)`), from the same project root. `session.test.ts` imports `@project/core` on line 2 (`import { uuidSchema } from '@project/core';`), so if `resolve.alias` had not been in play the file would not have collected at all. It collected 17 tests. There is no separate mewt "runner" — it literally spawns the string in `[test].cmd` in a shell and reads the exit code, so there is no adapter that could reinterpret the config.

**No, mewt does not distinguish "tests failed" from "test command errored."** The outcome enum is `TestFail | Uncaught | Timeout | Skipped`. Any non-zero exit is `TestFail`, which is scored as *caught*. This produced a **real false kill in this run**: mutant `CR 14` is invalid JavaScript (see §2), so vitest collected **zero** tests and mewt scored it as caught:

```
 ❯ packages/persistence/test/session.test.ts (0 test)
  Test Files  1 failed (1)
       Tests  no tests
STDERR:
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  packages/persistence/test/session.test.ts [ packages/persistence/test/session.test.ts ]
Error: Transform failed with 1 error:
.../packages/persistence/src/session.ts:158:9: ERROR: Expected ";" but found ":"
```

I scanned all 80 outcomes of the first campaign for this: exactly **1 of 80** was a transform/collect error scored as a kill, 42 were genuine assertion failures. So the contamination is small here but it is real, silent, and mewt gives you no flag to detect it. The pass count is not checked either — mewt never compares "17 tests ran" against the baseline, so any mutant that reduces collection to zero is a free kill.

## 2. TypeScript 7 / TypeScript 6 toolchain compatibility

**mewt never loads the `typescript` package. The ADR 0061 bridge is irrelevant to it.** This is verified, not assumed:

- `file` → `Mach-O 64-bit executable arm64`. `otool -L` lists only `libSystem.B.dylib`, `libobjc.A.dylib`, `Foundation`, `CoreFoundation`, `libiconv.2.dylib`. No JS runtime, no dynamically loaded parser.
- `strings` on the binary finds `tree-sitter` and `tree_sitter_cpp_external_scanner_deserialize`. The only `node_modules` / `typescript` hits in the binary are inside the **embedded copy of `example.toml`** (the `ignore = ["target", "node_modules", "vendor"]` comment lines), not code.
- **Decisive test:** I copied the pristine `git show HEAD:packages/persistence/src/session.ts` into a bare directory outside the repo — no `package.json`, no `node_modules`, no `tsconfig.json`, no lockfile — and ran `mewt mutate --config <that dir>/mewt.toml`. Result: `src/session.ts (javascript/ts): 7 high, 26 medium, 84 low severity mutants` → **117 mutants, identical to the in-repo count**. The parser needs nothing from the JS toolchain.
- The *oracle* runs inside the repo, but it is `vitest`, which transforms via esbuild and does not typecheck. So neither half of the pipeline touches `tsc`, `tsc6`, or the aliased `typescript` package. Nothing in the bridge was touched or needed to be.

**Language selection.** There is no `typescript` language: `mewt print mutations --language typescript` → `Error: Custom("No language resolver found for language: typescript")`. TypeScript is a *dialect* of the `javascript` family, inferred from the file extension: `packages/persistence/src/session.ts (javascript/ts)`. `--language javascript` lists all four dialects (`js`, `jsx`, `ts`, `tsx`).

**Parsing modern TS: correct.** `session.ts` uses `bigint`, `Extract<CommitResult, { kind: 'retryable-failure' }>`, discriminated unions in the `persistence` field, `readonly` interface members, optional members, and a generic arrow `const clone = <T>(value: T): T => structuredClone(value);` — the classic `.ts`-vs-`.tsx` tree-sitter ambiguity. mewt resolved the dialect from the extension and parsed all of it; line numbers, spans and `old_text`/`new_text` in the JSON output line up exactly with the source. (This file does not contain `satisfies` or `const` type parameters, so I cannot report on those from evidence.)

**Are the mutants valid TypeScript? Two separate answers.**

1. *Syntactically*, **116 of 117 are valid**. The one failure is a genuine operator bug: the `CR` (Comment Replacement) operator wraps a statement in `/* … */` without checking whether the statement **already contains a block comment**. `CR 14` comments out the 65-line `return { … }` at lines 125–189, which contains the long `/* An observer may complete the next Edit … */` doc comment. Nested block comments are illegal in JS, the inner `*/` closes the outer one, and the result is a parse error at the `retry: () =` fragment. Verbatim from `mewt print mutant --id 14`:

   ```
     /* return {
       getState: observable.getState,
       subscribe: observable.subscribe,
       /*
        * An observer may complete the next Edit while this one is still
   ```

   Any statement in this repo carrying an explanatory block comment — and this repo has many — will produce a broken `CR` mutant that is then scored as a kill.

2. *Type-wise*, **many mutants are not valid TypeScript at all**, and mewt makes no attempt to be. `COS` alone produced 63 of the 117, including `exportedRevision < null`, `exportedRevision <= null`, `state.persistence.kind < 'conflicted'` and `nextWaiting <= undefined`. `tsc` would reject every one of those. They execute only because vitest/esbuild strips types without checking. **This is a trap if the test command ever includes a typecheck**: those mutants would be "killed" by the compiler rather than by the tests, and the mutation score would become meaningless. Keep the oracle a pure `vitest run`.

## 3. Mutant targeting

**Targeting a single file is precise and did not leak.** Two equivalent ways, both used:

- config `[targets].include = ["packages/persistence/src/session.ts"]`
- positional argument: `mewt run packages/persistence/src/session.ts` (a positional *replaces* the config `include`, it does not merge)

`[targets].ignore` / `--ignore-targets` take **substring** matches, not globs. Every campaign reported `1 targets` and every result row is `Target: packages/persistence/src/session.ts (javascript/ts)`. Nothing from any other package or file was ever mutated. Targets, directories and globs (`"**/*.ts"`) are all accepted.

**Sub-file targeting is possible but two-step.** `run` has no `--line`, but enumeration does:

```
$ mewt print mutants --line 160 --format ids
7 14 19 26 92 93 94 95 96 97 98 48 116
$ mewt test --ids 92,93,94,95,96,97,98,48,116
```

Caveat: `--line` matches any mutant whose *span* covers that line, so the two whole-`return`-block mutants (`ER 7`, `CR 14`, lines 125–189) show up in a query for line 160.

**117 mutants for `session.ts`** (190 lines): 7 high, 26 medium, 84 low. Operators applied, by count:

| Slug | Operator | Count | Severity |
|---|---|---:|---|
| COS | Comparison Operator Shuffle (`==`,`!=`,`<`,`<=`,`>`,`>=`) | 63 | Low |
| AS | Argument Swap (adjacent args) | 14 | Low |
| IT | If True (hardcode condition to `true`) | 7 | Medium |
| IF | If False (hardcode condition to `false`) | 7 | Medium |
| ER | Error Replacement (statement → `throw new Error("mewt")`) | 7 | High |
| CR | Comment Replacement (statement → block comment) | 7 | Medium |
| NCR | Nullish Coalescing Replacement (`??` ↔ `\|\|`) | 5 | Medium |
| LOS | Logical Operator Shuffle (`&&` ↔ `\|\|`) | 4 | Low |
| BL | Boolean Literal Flip | 3 | Low |

The full JS/TS catalogue is 19 operators; the 10 unused ones (arithmetic, bitwise, shift, await-removal, negation-removal, loop-control, while-false) simply have no sites in this file. **COS is 54% of the corpus and is the main noise source** — on a string-literal union like `persistence.kind`, `kind < 'conflicted'` and `kind >= 'failed'` are nonsense mutants that survive trivially and tell you nothing. `[run].mutations = [...]` / `--mutations` can whitelist slugs, which is the obvious first tuning step.

One design note: by default mewt is **not** comprehensive — it skips lower-severity mutants on a line where a higher-severity mutant on that same line survived. Here that never fired (`Skipped: 0`) because all 7 high-severity `ER` mutants were caught. `--comprehensive` disables the skipping.

## 4. Report usefulness

Per survivor you get: status, operator slug, mutant id, line number, **the original source line and the mutated source line side by side**. With `--verbose` you additionally get the execution timestamp, the duration, and the **complete stdout and stderr of the test run**. `--format json` adds the byte offset, the 0-based line offset, the raw `old_text`/`new_text` token pair, and a sha256 of the target file. `--format sarif` emits valid SARIF 2.1.0 with `ruleId` set to the operator slug, so GitHub code scanning is available for free.

One real survivor entry, verbatim (`mewt results --id 116 --verbose`):

```
 Target: packages/persistence/src/session.ts (javascript/ts)
   Uncaught  | [NCR 116] Line 160: 'if (state.persistence.kind !== 'failed' || inFlight) return;' -> 'if (state.persistence.kind !== 'failed' ?? inFlight) return;'
   Executed at: 2026-08-22 01:35:45.219343 UTC, Duration: 2003ms
   STDOUT:

   RUN  v2.1.9 /Users/tobyhede/psrc/hyper/.worktrees/mutation-spike-mewt

   ✓ packages/persistence/test/session.test.ts (17 tests) 22ms

   Test Files  1 passed (1)
        Tests  17 passed (17)
     Start at  11:35:44
     Duration  965ms (transform 240ms, setup 99ms, collect 408ms, tests 22ms, environment 0ms, prepare 72ms)

  STDERR:
  11:35:45 am [vite] (ssr) warning: The "??" operator here will always return the left operand
  158|      retry: () => {
  159|        const state = observable.getState();
  160|        if (state.persistence.kind !== 'failed' ?? inFlight) return;
     |                                                ^
  161|        startCommit(state.working, state.acknowledgedRevision);
  162|      },

    Plugin: vite:esbuild
    File: /Users/tobyhede/.../packages/persistence/src/session.ts
```

**Can you tell what behaviour is unasserted? Yes, from the diff — but only because you can read the code.** This entry says: `retry()`'s `inFlight` guard was deleted (`a ?? b` where `a` is always a boolean returns `a`, so the `|| inFlight` disjunct is dead) and all 17 tests still pass. The gap is precise: *nothing asserts that `retry()` is a no-op while a commit is in flight.* That is an actionable, real hole. Several other survivors are equally sharp — `IF 20` (`if (false) return;` in `acceptRemote`) and `IF 21` (same in `resolveConflict`) mean the `kind !== 'conflicted'` guards on both are entirely unasserted, and four `AS` survivors show that `hasChangedSinceExport(a, b)` can have its two arguments swapped at every one of its four call sites without any test noticing.

**What it does not give you: any coverage mapping.** There is no "these 6 tests executed this line" and no "test X was expected to catch this". For a survivor the embedded test output is just `17 passed`, which is information-free. You get the mutation and the source; you supply the reasoning about which test should have died. For a killed mutant the output *is* useful (it names the failing tests and the assertion messages), but that is the case you do not need help with.

Final survivor list from the completed campaign (30 uncaught) is saved at `<worktree>/.mewt-spike/survivors.txt`, full JSON at `.mewt-spike/results-final.json`.

## 5. Runtime

All timings on darwin/arm64. **Load caveat, stated up front:** early measurements ran on a quiet machine; by the end of the spike another worktree (`.worktrees/stop-saying-workspace`) was running a Playwright suite and `uptime` reported a 1-minute load average of **126**. The per-mutant medians below come from mewt's own recorded `duration_ms` during the earlier, quieter phase; the campaign wall-clocks are inflated by contention and should be read as upper bounds.

| Measurement | Value |
|---|---|
| Plain `pnpm exec vitest run packages/persistence/test/session.test.ts`, quiet machine | **1.94 s** wall (vitest self-reported 367 ms; 17 tests) |
| Same command, machine at load 126 | 10.5 s / 12.0 s / 14.1 s over three runs |
| `mewt mutate` — enumerate 117 mutants | **0.111 s** |
| Per-mutant cost, **median** of 80 recorded outcomes | **1.84 s** — i.e. essentially the bare vitest cost; mewt's own overhead is negligible |
| Per-mutant cost, **mean** of the same 80 | **14.2 s** (a long tail dominates) |
| Campaign A — `timeout = 60`, 117 mutants, three passes | 600 s + 772 s + 221 s = **1593 s ≈ 26.6 min** → 67 caught / 30 uncaught / **20 timeout** |
| Campaign B — clean DB, single config `--test.timeout 10`, 117 mutants | 600 s + 449 s = **1049 s ≈ 17.5 min** → 48 caught / 30 uncaught / **39 timeout** |

**mewt does not parallelise. At all.** I sampled the process table repeatedly during a campaign and there was never more than one `vitest` process alive. There is no `--jobs`/`--concurrency` flag in `run --help`. This is structural, not an oversight — see the in-place-mutation finding in "Blockers" — a shared, mutated source file cannot be tested by two workers at once.

**The long tail is the whole story, and it is diagnosable.** `session.ts` is an async optimistic-commit state machine, and many mutations break the promise chain so that tests never settle. Those tests then hit **vitest's own default `testTimeout` of 5000 ms**, one after another. I proved this by re-testing mutant `IF 15` (which timed out at both the 60 s and 10 s settings) with a generous cap:

```
$ mewt test --ids 15 --test.timeout 300
WALL=88s
   TestFail  | [IF 15] Line 97: 'if (nextWaiting === undefined) {' -> 'if (false) {'
   Duration: 78271ms
   ❯ packages/persistence/test/session.test.ts (17 tests | 15 failed) 75158ms
     × ... Test timed out in 5000ms.   (×15)
```

15 hanging tests × 5000 ms = 75 s. `IF 15` is **caught**, but at any sane mewt timeout it was recorded as `Timeout` and dropped from the score.

**Consequence: `[test].timeout` silently rewrites your mutation score.** Timeouts are excluded from both numerator *and* denominator — mewt's summary line reads `Tested: 97 … Caught: 67, Uncaught: 30` and the 20 timeouts simply vanish. At `timeout = 10` that hidden bucket grew to 39 of 117 (33%) and the reported low-severity catch rate fell from 69.0% to 52.8% purely from the config change. To classify everything honestly, `[test].timeout` must exceed `(number of tests) × testTimeout` ≈ **90 s for this file**.

**Extrapolation to a correct, complete `session.ts` campaign.** ~78 mutants at the ~2 s median plus ~39 hang-prone mutants at ~80 s each ≈ **55 minutes**. **So no — 30 minutes is not enough**, as configured out of the box, on one core.

**But there is a cheap fix, and I measured it.** Lowering *vitest's* per-test timeout on the mewt test command (a CLI flag, not a config or source change) collapses the tail:

```
[test]
cmd = "pnpm exec vitest run packages/persistence/test/session.test.ts --testTimeout=300"
timeout = 120
```

The baseline still passes cleanly with this (`17 passed (17)`), and mutant `IF 15` went from **78.3 s → 14.7 s**, correctly classified as `TestFail`. Projected full campaign: ~78 × 2 s + ~39 × 15 s ≈ **12–13 minutes with everything classified** — comfortably inside 30 minutes, and that projection was made on a contended machine so it is pessimistic.

## 6. Source compromises required

**None.**

- `packages/persistence/src/session.ts` — unchanged. `git diff --exit-code` clean at the end.
- `packages/persistence/test/session.test.ts` — unchanged.
- `vitest.config.ts`, `tsconfig.base.json`, `package.json`, the TS 6/7 bridge — all unchanged and never touched. `git diff --exit-code` over all five files printed `ALL TRACKED FILES UNMODIFIED`.
- Added, all untracked and all inside the disposable worktree: `mewt.toml`, `.mewt-bin/`, `.mewt-spike/`. Only `mewt.toml` would need to be tracked to adopt the tool.
- No tsconfig strictness was loosened, no lint rule suppressed, no dependency added to any `package.json`.

One thing that is **not** a compromise but must be stated plainly: mewt rewrites `session.ts` in place during a run (see below). It restored it every time, and the tree was verifiably clean at the end — but the file *is* modified in the real working tree while the campaign is live.

## Blockers and caveats

1. **mewt mutates the tracked source file in place, in the real working tree.** This is the headline operational hazard. Verified directly: a `git diff` sampled every 2 s during a campaign showed the live mutation sitting in the file —

   ```
   packages/persistence/src/session.ts | 2 +-  1 file changed, 1 insertion(+), 1 deletion(-)
   -    void backend.commitSpace(clone(snapshot), expectedRevision).then((result) => {
   +    void backend.commitSpace(expectedRevision, clone(snapshot)).then((result) => {
   ```

   — persisting for 12+ seconds while that mutant's tests ran. It bit me for real: I copied `session.ts` out to a scratch directory mid-campaign and got a *mutated* copy, which then enumerated 111 mutants instead of 117. Implications: nothing else may read the repo during a campaign; a Vite HMR dev server watching the checkout would hot-reload mutated code; two agents cannot share a checkout; and parallelism is impossible without per-worker worktrees, which mewt does not create.

   Mitigation: mewt does install a signal handler. I `SIGINT`-ed and `SIGTERM`-ed campaigns three times and the file was restored cleanly every time (`git status` empty). A `SIGKILL`, an OOM kill, or a power loss would leave a mutated tracked file on disk with no marker. **Run it only in a throwaway worktree.**

2. **No parallelism.** One `vitest` at a time, no flag to change it. Wall clock is strictly linear in mutant count. This is a direct consequence of (1).

3. **Timeouts are silently excluded from the mutation score.** Not counted as caught, not counted as uncaught, not counted in the denominator, and reported on a separate line from the headline `Tested/Caught/Uncaught` summary. Classical mutation testing treats a timeout as a kill; mewt treats it as absent. On this async file that meant 17–33% of the corpus vanished from the score depending on one config value. There is no option to change this.

4. **A test *command* error is scored as a kill.** No status distinguishes "the suite failed an assertion" from "the suite never compiled". Confirmed with `CR 14`: 0 tests collected, scored caught.

5. **The `CR` operator emits invalid JS on any statement containing a block comment** (nested `/* */`). One occurrence in 117 here; this repo's commenting style means it would recur. Combined with (4) it is an invisible false kill, not a visible error.

6. **No coverage mapping in the report.** You cannot see which tests exercised a survivor, so triage is manual reasoning from the diff.

7. **Operator mix is comparison-heavy and type-blind.** 63 of 117 mutants are `COS`, many of them ordering comparisons on string-literal unions and `null`, which are not even type-valid TypeScript. They inflate the corpus and the survivor list with noise. `--mutations` whitelisting is the mitigation but it is a manual curation job per codebase.

8. **Maturity.** The repo was created **2025-11-26** (≈9 months old), has **54 stars** and 8 open issues, last pushed 2026-08-12. It is actively developed but young, and it is a Trail of Bits research-adjacent tool rather than an established JS-ecosystem product. There is no npm distribution — CI adoption means downloading a GitHub release binary, and note the npm package literally named `mewt` is an unrelated immutability library.

9. **AGPL-3.0.** Evidence-based, from `LICENSE` and the GitHub API. Not a legal blocker for running it over your own source, but a licence worth a deliberate decision.

10. **`mewt` silently creates a `mewt.sqlite` in whatever cwd it is invoked from** when no `mewt.toml` is found by walking up. Running `mewt print mutations --language javascript` from the main checkout (before I had `cd`-ed into the worktree) dropped an empty 32 KB `mewt.sqlite` at `/Users/tobyhede/psrc/hyper/mewt.sqlite`. I removed it; `git status` on the main checkout is back to its pre-spike state. If adopted, `mewt.sqlite` needs a `.gitignore` entry, or the `db` path needs pinning in a tracked `mewt.toml`.

11. **Minor accounting inconsistency in `mewt status`**: it reported `55 tested` while `results --all` returned 58 outcomes; the 3 timeouts are excluded from "tested" but listed in the same "Outcomes" line. Cosmetic, but it makes the completion percentage read low.

Not determined: whether mewt can be pointed at a git worktree it creates itself (it cannot, as far as the CLI shows); whether there is any equivalent-mutant suppression or inline ignore comment (nothing in `--help` or `configuration.md`); behaviour on multi-file targets in this monorepo at scale (I deliberately scoped to one file); CI ergonomics (not run).

## Verdict in one paragraph

I would ship it for this repo, with two mandatory conditions: it runs only in a disposable git worktree, and the vitest command carries `--testTimeout=300` with `[test].timeout = 120`. **The strongest argument for** is that it is the lowest-friction engine imaginable here — one 25 MB static binary that touched nothing outside the directory I pointed it at, twelve lines of TOML, zero npm dependencies, zero source changes, and complete indifference to the TypeScript 6/7 bridge because it parses with its own tree-sitter grammar and never loads the `typescript` package; it ran the repo's real vitest through the repo's real root config with alias resolution intact, and the 30 survivors it found on `session.ts` include genuinely sharp, actionable gaps (the unasserted `inFlight` guard on `retry()`, the unasserted `conflicted` guards on `acceptRemote` and `resolveConflict`, and argument-swappability at all four `hasChangedSinceExport` call sites). **The strongest argument against** is that it rewrites your tracked source file in place with no isolation and therefore cannot parallelise — a design choice that simultaneously makes it unsafe to run in a working checkout, caps throughput at one test process forever, and, compounded by scoring a compile error as a kill and dropping timeouts out of the score entirely, means the number it prints is quietly softer than it looks.
