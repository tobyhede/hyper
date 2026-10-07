# Code-quality audit — 2026-09-26

Reference: fetched origin/main `98b7ccae988b0cfca6a003872b1793b1cc5fcaeb`; HEAD matched. Reviewed changes since `99b9ac07`. Two agents independently checked persistence and UI; the lead checked maintenance, new measurement code and recorded benchmark artifacts. No skills or project-memory documents were used. Issue records were read as claims to verify, not as proof of implementation.

**Result: 28 issues implemented or decided, one deferred (25), one partially covered with a small test gap (30).** No confirmed new runtime regression was found in this bounded audit.

## Every issue

| Issue | Assessment | PRs | Verification |
|---|---|---|---|
| 01 | Complete | 276 | Written rule, examples and gate inventory remain; the inventory was reconciled with completed cleanup. |
| 02 | Complete | 277 | Public lifecycle characterization retained; fresh persistence tests pass. |
| 03 | Complete | 277 | Pure lifecycle planners remain separate from registry execution. |
| 04 | Complete | 277 | Explicit phase machine, ownership and unwind paths retained. |
| 05 | Complete | 279 | Pure placement module consumed by Dock; geometry tests pass. |
| 06 | Complete | 279 | Separate Spaces control and shared context/types retained. |
| 07 | Complete | 279 | Separate Map/Graph controls retained. |
| 08 | Complete | 279 | Separate Resources control and one chrome-type owner retained. |
| 09 | Complete | 278 | Named App derivations/hooks retained; latest App changes are comments. |
| 10 | Complete | 297,300,301 | Implementation and test/story comment sweeps landed; later corrections fixed misleading comments. ResourceContent now accurately describes Open/rendered content and POST transport. |
| 11 | Complete | 286 | 43-row classification and individual approvals retained. |
| 12 | Complete | 291 | Approved test removals/folds retained; replacement lint/config unchanged; roadmap, public surface, vocabulary and retry policy checks pass. |
| 13 | Decision complete | 287,298 | SQLite and its CI, local mutation setup, and TypeScript bridge retained. No implementation/config changes undermine the prior verification; CI expansion remains deferred. |
| 14 | Complete | 277 | Recovery restored after failed replay preparation; regression tests pass. |
| 15 | Complete | 281 | Finite geometry checks retained; boundary tests pass. |
| 16 | Complete | 277 | Partial preparation, malformed settlements and illegal-transition coverage retained and passing. |
| 17 | Complete | 296 | PostgreSQL/SQLite/memory targets, independent-process contention harness and successful recorded diagnostic run verified; downloaded report matches recorded findings. Accepted contention decision is recorded. |
| 18 | Complete | 294 | Narrow warning guard and async settlement retained. Fresh broad React selection has zero act warnings. |
| 19 | Complete | 278 | Obsolete failures cannot clear live cache epoch; regression tests pass. |
| 20 | Complete | 290 | Changed/new Resources compared against baseline reread under row lock; behavior unchanged by comment sweep. |
| 21 | Complete | 293 | Identity/ownership predicate, shared aggregate lock and separate fallback transaction retained; decision tests pass. |
| 22 | Complete | 289 | Request-wide size refusal, retained edits and explicit Retry retained; HTTP/app tests pass. |
| 23 | Complete | 284 | Recovery ownership checks and pointer clearing retained; regressions pass. |
| 24 | Complete | 288 | Current blockage, blocking-Space navigation and explicit Retry retained; persistence/app tests pass. |
| 25 | Deferred | Filed287; reconciled298 | User deferral is now explicit in ticket. No CI mutation job added. |
| 26 | Complete | 302 | Unused LinkActionsIcon declaration/export removed; no source/test references remain. |
| 27 | Decision complete, qualified | 304 | Abstention retained with named browser tests and documented with/without-hook experiment. Root cause is explicitly undiagnosed; failing experimental runs were not independently rerun. |
| 28 | Complete | 303,305 | open/data-open/resource-not-open migration present throughout render/refusal paths, with passing vocabulary guard and preserved platform aria-expanded. |
| 29 | Complete | 300,301 | Test/story/E2E comment sweep and subsequent factual corrections merged. Its remaining unchecked boxes are stale completion bookkeeping. |
| 30 | Partially covered; narrow remaining test | — | Refusal rendering and Map-change notice clearing are tested separately; one combined application scenario is still absent. |

## Remaining work

**30: add one application regression test, in one small PR.** Existing `SpaceApp.test.tsx:1223` already mocks a `map-not-found` Delete Map refusal, renders the standing notice, and manually dismisses it. `command-outcomes.test.ts:250` already proves Map changes clear the Map-dependent channels, including map-delete seeded at143. The mechanism is the navigation subscription in `command-outcomes.ts:533`, not an untested React effect. Extend or complement the application scenario: display the refusal, select another Map, assert the notice disappears. Keep the existing lower-level coverage. The ticket's proposal of a real concurrent deletion/E2E race is not established as necessary.

**25 stays deferred.** No new infrastructure work follows from this audit.

**Minor record cleanup:** narrow30's premise and mark29's acceptance checkboxes to match its completed status. Ticket17's original Problem/Evidence paragraphs still describe the pre-optimization implementation, despite the clearly labelled historical baseline and current results later in the file; label those opening paragraphs historical too. This is editorial cleanup, not a reason to reopen17.

## Measurement evidence

Reviewed the PostgreSQL target, separate worker processes and connection pools, barriers, six contention phases, SQL statement instrumentation, and standalone workflow. Independently verified [run36125027490](https://github.com/tobyhede/hyper/actions/runs/36125027490) succeeded at `dadf6360c19b15ab8d5fb1dd5b222e528ca1f5dd`; downloaded its `persistence-cost-report` artifact to `/private/tmp/cq-pg-audit-98b7` and checked reported PostgreSQL contention figures against ticket17.

The measurement is complete for its stated scope. It uses in-process HTTP and PostgreSQL loopback transport, not a browser/network end-to-end workload. Findings are one measured runner/workload range, not universal capacity guarantees. Per-statement lock durations include query execution and have millisecond resolution; the reporting code excludes zero durations from its lock distributions. Treat these as approximate nonzero lock-statement timings rather than exact population lock-wait percentiles. That qualification does not invalidate the observed shared/exclusive contention distinction or the recorded acceptance of its tradeoff.

## ResourceNode experiment evidence

Issue27 distinguishes the initial confounded full-suite experiment from six app and three Ladle cases rerun with/without the hook, and records that the cause remains undiagnosed. Source/test comments now name behavioral tests rather than obsolete handle explanations. The experimental commit was unpushed; failing-run artifacts were not inspected and the experiment was not rerun in this audit. Its results are author-recorded evidence. PR304's successful actual product CI establishes the retained baseline, not independent proof of the experimental cause.

## Fresh verification

**2,245 distinct tests across153 files passed**, counting overlapping runs once:

- Persistence/schema/graph/HTTP/SQL selection:459 tests/19files.
- Command outcomes and Map authoring commands:102 tests/2files.
- App/UI/render-adapter plus warning guard, HTTP-size and vocabulary selection:1,729 tests/132files, zero act warnings.
- Maintenance selection:150 tests/4files, overlapping vocabulary. Four roadmap CLI cases initially encountered sandbox-blocked tsx IPC; the complete38-test file passed outside the sandbox.

No full verify, fresh database integration, fresh browser/Ladle run or forced-remeasurement experiment was performed. Prior database results are not relabelled as current runs. Source changes to the persistence/SQL behavior since the previous audit are comments only.

Logs: `/private/tmp/cq-persistence-98b7ccae.log`, `/private/tmp/cq-map-refusal-98b7ccae.log`, `/private/tmp/hyper-audit-ui-sep26.log`, `/private/tmp/cq-maintenance-98b7.log`, `/private/tmp/cq-roadmap-98b7.log`.
