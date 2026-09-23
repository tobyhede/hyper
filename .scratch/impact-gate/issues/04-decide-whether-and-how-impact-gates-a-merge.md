# 04: Decide whether and how impact gates a merge

**What to build:** a recorded decision on the role of change impact in merging, backed by calibrated grades from real pull requests. The options:

- stay warn-only (a report, never a gate)
- block on the without-tests grade at a chosen percentile
- make the impact job one the `ci` gate depends on

The decision waits for ticket 02, because a gate on the seed curve alone would block nearly every multi-file branch this repo produces. The formula multiplies by files changed, and both dry-run branches graded p99.5.

Whether the with-tests score should gate at all is part of the decision. Test churn raises it without adding structural decay to production code, which is what the tool exists to catch.

**Blocked by:** 02: Grade against this repo's own history, not only the seed curve

**Status:** resolved

- [x] Calibrated grades from a representative set of merged PRs are collected in this ticket, with the method.
- [x] The decision, the score it gates on (if any), and the percentile are recorded with reasons.
- [x] If it gates: the threshold is set in configuration, not scattered across flags, and a blocked PR's report says what to refactor. (Does not gate; see the Answer.)
- [x] If it joins the `ci` gate: `CLAUDE.md`'s description of the CI jobs is updated in the same change. (Does not join it; see the Answer.)

## Answer

**Warn-only, and kept out of the `ci` gate.** Both reports stay, and so do ImpactGate's defaults: p90 warn, p98 block, `K = 200`. Nothing about the workflow changes.

Why no gate, strongest reason first:

- **The per-function figures come from a parser that mis-spans this repo's TypeScript, in both directions.** ImpactGate takes each unit's line span from lizard (1.23.0 as resolved) and trusts it. On `CommandDock.tsx` at `main`, lizard spans the 9-line branchless `ResourcesTrigger` over lines 1285–2785 and reports CC 92: `createContext<{ current: boolean } | null>` at line 693 derails its state machine six hundred lines before the damage shows (ticket 05 corrects this from line 236). On `space-authoring.ts` after PR #267 it ends `deriveCompletedEdit` at line 1116, where a nested `writeMap` arrow begins, though the function runs 943–1463, and reports CC 30. Any gate would rest on numbers already shown wrong in two of the four largest files.
- **The total measures how wide a change is and what it touched, not what it added.** `total = Σ per-file cost × files changed`, hard-coded (`engine.py:148`, `files_changed = len(scored)`), with no flag to normalise it. For files of similar cost that is quadratic in breadth. Across the calibration set with the codemods excluded, the "Files to consider for refactoring" rows charged 5,405,130 of pre-existing cost against 120,342 of new cost, so new code was 2.2% of it. Those rows are each report's top five files, not every file. The rename in PR #250 scored 10,235,092,217 over 427 files, which puts the safest class of change at the top.
- **A percentile gate is a quota.** It is graded against this repo's own history, weighted `w = n / (n + K)`, and that weight grows as history accumulates (0.66 to 0.68 over this sample). At steady state it fails a fixed fraction of PRs however good the code gets. Absolute `warn_at` / `block_at` exist with the curve off and would remove this objection, but neither of the two above.

What it is good for: it ran cheaply on every PR (12s on a cache hit), and it did correctly flag the repo's most complex function. `deriveCompletedEdit` was CC 133 over its real span before PR #267. So it stays as a report.

The with-tests report stays too, not as a gate. Near the warn line the two grades agree to within a point (p91.9 / p91.63 on `snapshot-edits-split-03`, p87.92 / p88.4 on `28-open-spaces-owns-its-listing`). On test-heavy branches they part sharply (`feat/database-target-composition` p88.63 / p64.83, `startup-pending-view` p52.51 / p12.7). The gap between them is what tells a reader how much of a score is test churn.

**What reopens this.** Both of these, with no date:

1. A pinned lizard that spans this repo's TypeScript correctly.
2. A gateable quantity other than `Σ × N`, from ImpactGate or derived from its JSON report.

Until both hold, a gate would rest on numbers already shown wrong. Ticket 05 reduces the lizard defect to a repro.

## Comments

Calibration. It covers the Impact workflow's pull-request runs from PR #231's merge to 2026-09-23: one row per branch, taken from that branch's most recent completed, successful run. Every pull-request run in the window succeeded, so each is simply the branch's latest. Each row is `score / grade / files changed`. Codemod branches are shown but excluded from the distribution figures, because breadth-squared inflates them while they carry little risk: `map-resource-01` (PR #249, the prose sweep before the rename) and `map-resource-02` (PR #250, the rename itself). Produced by `.scratch/impact-gate/calibration.py --limit 100`, which reads each run's log through `gh run view --log` and parses ImpactGate's markdown out of it. That parser breaks if ImpactGate changes its output.

| date | branch | with tests (score / grade / files) | without tests | job |
|---|---|---|---|---|
| 2026-09-18 | `remove-authoring-placement-copy` | 37,744,979 / p95.86 / 29f | 14,376,924 / p95.24 / 12f | success |
| 2026-09-18 | `memory-backend-names-its-meta` | 866,970 / p79.49 / 30f | 20,152 / p51.46 / 4f | success |
| 2026-09-19 | `dock-always-reaches-meta` | 41,038,677 / p95.88 / 27f | 16,270,980 / p95.43 / 11f | success |
| 2026-09-19 | `parallel-graph-lanes` | 249,067 / p69.46 / 7f | 48,735 / p61.46 / 3f | success |
| 2026-09-19 | `broken-stored-state-one-identity` | 654,325 / p77.27 / 7f | 227,709 / p74.75 / 3f | success |
| 2026-09-19 | `derive-graph-fade` | 286,286 / p70.58 / 13f | 4,004 / p35.64 / 2f | success |
| 2026-09-20 | `one-sql-repository` | 7,313,709 / p90.33 / 39f | 680,010 / p83.72 / 19f | success |
| 2026-09-20 | `sql-repository-follow-up` | 218,504 / p67.47 / 8f | 64,143 / p62.99 / 3f | success |
| 2026-09-20 | `raise-conflict-submits-working` | 525 / p7.42 / 1f | no source to score | success |
| 2026-09-20 | `map-and-resource` | 215 / p3.68 / 1f | 215 / p8.97 / 1f | success |
| 2026-09-20 | `ticket-29-fast-path-meta-identity` | 30,936 / p47.2 / 4f | 655 / p14.54 / 1f | success |
| 2026-09-20 | `graph-hud` | 1,216,926 / p82.05 / 18f | 310,932 / p78.53 / 9f | success |
| 2026-09-20 | `map-resource-03` | 360 / p6.17 / 8f | 360 / p11.85 / 8f | success |
| 2026-09-20 | `map-resource-01` (codemod) | 8,361,444 / p90.91 / 93f | 4,198,950 / p91.81 / 50f | success |
| 2026-09-20 | `map-resource-02` (codemod) | 10,235,092,217 / p99.84 / 427f | 2,920,523,530 / p99.83 / 194f | success |
| 2026-09-21 | `codemod-scope-and-migration-hazard` | 2,898 / p13.78 / 3f | 2,898 / p21.58 / 3f | success |
| 2026-09-21 | `worktree-ticket-22-audit-corrections` | 599,160 / p76.26 / 6f | 599,160 / p82.98 / 6f | success |
| 2026-09-21 | `map-resource-04` | 0 / p0.97 / 1f | no source to score | success |
| 2026-09-21 | `startup-pending-view` | 43,180 / p52.51 / 10f | 450 / p12.7 / 5f | success |
| 2026-09-21 | `feat/database-target-composition` | 5,924,444 / p88.63 / 47f | 89,440 / p64.83 / 20f | success |
| 2026-09-21 | `fix/close-database-on-host-shutdown` | 140,031 / p63.08 / 3f | 6,032 / p40.18 / 2f | success |
| 2026-09-21 | `audit-2026-09-20-tickets` | no source to score | no source to score | success |
| 2026-09-21 | `unavailable-arm` | 2,052,078 / p84.18 / 21f | 490,806 / p82.12 / 9f | success |
| 2026-09-21 | `card-operation-capability` | 1,400,184 / p82.64 / 9f | 183,240 / p72.01 / 5f | success |
| 2026-09-22 | `marker-cache` | 174,306 / p64.94 / 11f | 60,804 / p62.14 / 6f | success |
| 2026-09-22 | `retire-link-actions-icon` | 2,628 / p19.33 / 4f | 2,628 / p27.41 / 4f | success |
| 2026-09-22 | `ticket37-sqlite-recovery-proof` | 1,763 / p14.74 / 1f | no source to score | success |
| 2026-09-22 | `ladle-story-audit` | 346,340 / p71.49 / 10f | 95,515 / p65.54 / 7f | success |
| 2026-09-22 | `28-open-spaces-owns-its-listing` | 4,891,113 / p87.92 / 9f | 1,818,188 / p88.4 / 4f | success |
| 2026-09-22 | `snapshot-edits-split-03` | 9,699,856 / p91.9 / 8f | 4,113,244 / p91.63 / 4f | success |
| 2026-09-23 | `structural-tokens` | 21,112 / p41.29 / 7f | 0 / p2.71 / 1f | success |

- With tests, codemods excluded: 28 branches, median p70.0, quartiles p24.8/p83.8, max p95.88, WARN 4
- Without tests, codemods excluded: 25 branches, median p63.0, quartiles p24.5/p82.6, max p95.43, WARN 3

Driver rows (with tests), mis-span marks from hand checks; unmarked rows are unverified:

| branch | location | cc | wmc | kind | check |
|---|---|---|---|---|---|
| `remove-authoring-placement-copy` | `packages/app/src/space-authoring.ts:deriveCompletedEdit` | 133 | 160 | mutation | unverified |
| `remove-authoring-placement-copy` | `packages/app/src/space-authoring.ts:complete` | 10 | 279 | mutation | unverified |
| `remove-authoring-placement-copy` | `packages/app/src/App.tsx:runEntityCommand` | 52 | 147 | mutation | mis-spanned: 6-line arrow with one optional chain |
| `remove-authoring-placement-copy` | `packages/app/src/space-authoring.ts:edgeEligibility` | 5 | 289 | mutation | unverified |
| `remove-authoring-placement-copy` | `packages/app/test/render-adapter.test.ts:(anonymous)` | 1 | 97 | mutation | unverified |
| `dock-always-reaches-meta` | `packages/app/src/components/CommandDock.tsx:ThingsTrigger` | 91 | 51 | mutation | mis-spanned: the same function under its old name |
| `dock-always-reaches-meta` | `packages/app/src/App.tsx:runEntityCommand` | 53 | 147 | mutation | mis-spanned: 6-line arrow with one optional chain |
| `dock-always-reaches-meta` | `packages/app/src/dock-model.ts:openTree` | 4 | 35 | mutation | unverified |
| `dock-always-reaches-meta` | `packages/app/ladle-e2e/command-dock.spec.ts:(anonymous)` | 4 | 61 | mutation | unverified |
| `dock-always-reaches-meta` | `packages/app/test/space-thing-embedded-diagram.test.tsx:(anonymous)` | 5 | 202 | mutation | unverified |
| `one-sql-repository` | `test/integration/postgres-space-repository.test.ts:(anonymous)` | 1 | 97 | mutation | unverified |
| `one-sql-repository` | `packages/http/src/index.ts:(anonymous)` | 7 | 77 | mutation | unverified |
| `one-sql-repository` | `packages/http/src/index.ts:createSpaceHttpApp` | 7 | 74 | mutation | unverified |
| `one-sql-repository` | `test/integration/postgres-space-repository.test.ts:(anonymous)` | 3 | 97 | mutation | unverified |
| `one-sql-repository` | `test/support/repository-contract.ts:(anonymous)` | 2 | 95 | mutation | unverified |
| `map-resource-01` | `packages/app/src/components/CommandDock.tsx:ThingsTrigger` | 91 | 51 | mutation | mis-spanned: the same function under its old name |
| `map-resource-01` | `packages/app/src/App.tsx:App` | 10 | 188 | mutation | unverified |
| `map-resource-01` | `packages/react-flow-adapter/src/ThingNode.tsx:(anonymous)` | 29 | 35 | mutation | unverified |
| `map-resource-01` | `src/aggregate-directory/space-directory.ts:readSingleSpace` | 12 | 22 | mutation | unverified |
| `map-resource-01` | `packages/graph/test/graph.property.test.ts:diagramOver` | 3 | 67 | mutation | unverified |
| `map-resource-02` | `packages/app/src/space-authoring.ts:deriveCompletedEdit` | 133 | 142 | mutation | unverified |
| `map-resource-02` | `packages/app/src/App.tsx:runEntityCommand` | 53 | 145 | mutation | mis-spanned: 6-line arrow with one optional chain |
| `map-resource-02` | `packages/app/src/components/CommandDock.tsx:ResourcesTrigger` | 91 | 51 | rename | mis-spanned: 9-line branchless function; lizard spans it to the end of the file |
| `map-resource-02` | `packages/persistence/src/session-registry.ts:plan` | 33 | 320 | mutation | mis-spanned: five units share the name; the reported span is not any one of them |
| `map-resource-02` | `packages/persistence/src/session-registry.ts:createSpaceSessionRegistry` | 62 | 280 | mutation | unverified |
| `snapshot-edits-split-03` | `packages/app/src/space-authoring.ts:deriveCompletedEdit` | 30 | 142 | mutation | mis-spanned: lizard ends the span at 1116; the function runs 943-1463 |
| `snapshot-edits-split-03` | `packages/graph/test/snapshot-edits.property.test.ts:(anonymous)` | 4 | 40 | mutation | unverified |
| `snapshot-edits-split-03` | `packages/graph/test/snapshot-edits.property.test.ts:(anonymous)` | 11 | 40 | mutation | unverified |
| `snapshot-edits-split-03` | `packages/graph/test/snapshot-edits.property.test.ts:(anonymous)` | 6 | 40 | mutation | unverified |
| `snapshot-edits-split-03` | `packages/graph/test/snapshot-edits.property.test.ts:(anonymous)` | 5 | 40 | mutation | unverified |

On the driver rows: "mis-spanned" marks the five rows checked by hand against the source, where the reported figure is not the function's own. "Unverified" means nobody checked the row, not that it was checked and found right. `deriveCompletedEdit` at CC 133 before PR #267 was checked: lizard's span there ends at the function's own closing `};`. It is listed unverified only because the script keys checks by branch.

Correction to a figure that went round in review. `deriveCompletedEdit` did not fall from CC 133 to 30 in PR #267. Over its real spans (from the base and head of #267) it went from 570 to 521 lines and from 135 to 123 branch tokens. That count is crude: `if`, `case`, `for`, `while`, `catch`, `&&`, `||`, `??` and ternaries, found by grep. The 30 is lizard truncating the span.

ImpactGate internals, from the `impact-gate==0.3.2` wheel's source:

- **`n` and `w`:** `n` is the number of project baseline observations, and `w = n / (n + K)` is the project's weight, with the seed curve taking `1 − w` (`baseline.py:193-195`). `K` defaults to 200 and is set by `--curve-prior-weight`.
- **Tests are scored:** `is_test` is defined (`core/config.py:80`) and never called. That is why ticket 01 excludes test homes with ignore globs.
- **Matching units across a change:** by name (`impact.py:104`), so when a name repeats (`plan`, `(anonymous)`) the last one wins. If there's no exact match it falls back to Jaccard (`rename_jaccard: 0.6`).
- **Units outside a class:** every free function shares the container `""`, so `WMC_other` is the whole file scope's CC.
- **Baseline observations:** a leaf merged PR is one observation (merge-base to tip). A PR scored in range mode goes through the same `score_change`, so the comparison is like-for-like. Direct-to-main commits are also observations.
- **Absent:** normalisation by file count, per-file or per-function thresholds, and any exemption for mechanical renames.


Excluding rename PRs from the baseline. Asked in review, because renames are relatively rare. It changes no verdict and is not adopted.

`main` holds six mechanical vocabulary renames, found by title and then by width. Four of them are among the six widest PRs the repo has merged:

| PR | files | rename |
|---|---|---|
| #250 | 523 | Diagram → Map, Thing → Resource |
| #187 | 390 | Card → Thing |
| #185 | 270 | Layout → Diagram |
| #36 | 153 | Route → Graph |
| #224 | 126 | Alias → Reference Thing |
| #249 | 105 | prose sweep before #250 |

Method. Four baselines were built locally over `origin/main` at `9a978bcd` with `impact-gate==0.3.2`: with and without tests, each with and without `--exclude-subject-pattern '#(36|185|187|224|249|250) from'`. Each exclusion removed exactly six observations (432 → 426 with tests, 392 → 386 without), so each rename was one leaf observation. Every calibration score above was then re-graded against each pair with ImpactGate's own `baseline.grade_value` (`K = 200`, TypeScript seed). These are grades against today's baseline, so they differ slightly from what CI reported at the time.

Findings:

- **Where the renames sit.** Five of the six rank above p95 of project history, and three above p99. They are most of the extreme tail but not all of it: the largest non-rename observation is 1,227,356,704 with tests.
- **What happens to every other PR.** Every grade rises, because removing the top of the tail leaves less above everyone else. With codemods excluded, the shift was +0.01 to +0.86 points with tests and +0.02 to +0.94 without. No branch crossed p90 or p98 in either direction. `snapshot-edits-split-03` went 91.85 → 92.57, `dock-always-reaches-meta` 95.81 → 96.57, and `one-sql-repository` 90.11 → 90.97. The effect is small because six is 1.4% of the observations, and the project curve carries only `w ≈ 0.68` of the blend.
- **Where it does matter.** The smallest observed score graded at or above p98 fell by about a third: 157,411,884 → 106,068,040 with tests, and 69,498,520 → 46,794,110 without. p90 moved less: 7,313,709 → 6,762,096 and 2,750,208 → 2,250,647. Under warn-only, nothing reads p98.

Why not adopt it anyway: the pattern matches the merge subject, `Merge pull request #N from owner/branch`, which carries the PR number and branch name but never the title. The six renames used six unrelated branch names. Excluding them means either a hand-kept list of PR numbers edited after every rename, or a branch-naming convention (`rename/…`) that nothing enforces. That is maintenance for a sub-point shift that changes no verdict.

If this ticket reopens for a gate, adopt the exclusion then, through the branch convention. That is when a p98 bar a third lower matters.
