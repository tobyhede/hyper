# Code-quality progress audit — 99b9ac07

Reference: fetched `origin/main` at `99b9ac0730607b99e7cdcec5e01393fd073f9ffc`, 2026-09-25. HEAD matched. Two delegated agents reviewed persistence and UI; the lead reviewed maintenance, test classification, infrastructure and measurement. Source and executable checks determine status, not the ticket labels. No skills or project-memory documents were used. Ticket 01's changed rule was read only as its deliverable.

## Assessment

22 of 25 issues are implemented or decided. Ticket 10 remains open, ticket 17 remains partial, and ticket 25 is deferred by the user. No confirmed new runtime defect was found in the bounded review. Completion does not imply fresh execution of every historical acceptance command.

## Every issue

| Issue | Assessment | Merged PR | Implementation evidence |
|---|---|---|---|
| 01 | Complete | 276 | Comment rule contains lineage/citation criteria, examples and gate inventory. |
| 02 | Complete | 277 | Public lifecycle tests characterize coordination, settlements and recovery. |
| 03 | Complete | 277 | Lifecycle planning is extracted from registry orchestration into its own pure planner. |
| 04 | Complete | 277 | Coordinated commit owns explicit phases, legal transitions and recovery. |
| 05 | Complete | 279 | Pure Dock placement module and focused geometry tests. |
| 06 | Complete | 279 | Spaces cluster extracted and consumed by the Dock. |
| 07 | Complete | 279 | Map/Graph cluster extracted and consumed by the Dock. |
| 08 | Complete | 279 | Resources cluster, shared parts/context and one chrome-type owner present. |
| 09 | Complete | 278 | App derivations live in named hooks with focused tests. |
| 10 | Open | — | Source still contains lineage and inaccurate present-behavior claims, including ResourceContent's view-source and PUT-endpoint prose. All split prerequisites are satisfied. |
| 11 | Complete | 286 | Root and package inventory records 43 rows and individual decisions. |
| 12 | Complete | 291 | Approved removals/folds implemented; lint enforces folded boundaries and type imports; roadmap owns duplicate-ticket checks; vocabulary guard retains source/data and excludes prose. |
| 13 | Decision complete | 287 | SQLite runtime and CI remain; optional local mutation commands and null failure threshold remain; TypeScript 7 compiler and TypeScript 6 API bridge verified. CI expansion is deferred under 25. |
| 14 | Complete | 277 | Failed replay preparation restores retryable recovery rather than consuming it. |
| 15 | Complete | 281 | Geometry schemas reject non-finite coordinates and dimensions at intake. |
| 16 | Complete | 277 | Tests cover partial preparation cleanup and malformed settlements without partial mutation. |
| 17 | Partial | 282 | SQLite/memory harness merged; no PostgreSQL target or independent-client contention benchmark. Old findings describe pre-20/21 implementation. |
| 18 | Complete | 294 | Test-owned async settlement, narrow pass-through warning guard and empty-target hook lifecycle fix implemented. |
| 19 | Complete | 278 | Obsolete request failure cannot clear the live cache epoch. |
| 20 | Complete | 290 | Unchanged Resource documents skipped using baseline reread under row lock; checked upserts retained for changed/new Resources. |
| 21 | Complete | 293 | Fast-path predicate preserves cross-Space identity/ownership facts. Shared aggregate lock precedes reads; fallback starts a separate transaction to avoid lock-upgrade deadlock. Differential/race tests present. |
| 22 | Complete | 289 | Request-wide size feedback, retained edits and explicit Retry implemented; HTTP/app/browser regression source covers sufficient and insufficient reduction. |
| 23 | Complete | 284 | Superseded recovery cannot replace a participant owned by a newer recovery. |
| 24 | Complete | 288 | Refused replay is surfaced with blocker identity; navigation and deliberate Retry preserve current working edits; resolving blocker alone does not replay. |
| 25 | Deferred | Filed by 287 | User explicitly deferred CI mutation work. No mutation job exists in CI. Ticket's needs-triage label is stale relative to that instruction. |

## Remaining work and recommendations

1. **Ticket 17: complete PostgreSQL measurement in its own PR.** Measure current code after 20/21, record historical baseline commit explicitly, include shared/exclusive aggregate-lock contention with independent clients, and collect controlled timings. The harness still runs only SQLite and memory through in-process HTTP. PostgreSQL correctness tests passing is not PostgreSQL performance measurement. Retire or qualify the old capacity claim based on high-load timings, and correct the statement that shrinking an oversized candidate cannot save.
2. **Ticket 10: apply the comment rule in a separate PR.** Preserve directives and invariants, correct stale behavioral claims, and verify unchanged compiled output. PR 295 is an open, narrowly scoped correction to the Spaces Exit comment; it does not complete the broad sweep. Coordinate that overlap rather than duplicating its patch.
3. **Small tracker reconciliation:** mark 25 deferred, make 13's prospective CI decision clearly subordinate to that deferral, and update stale completion text. Tickets 05–08 still say browser checks are pending, but PR 279's actual e2e and Ladle jobs succeeded. Ticket 18 retains an old paragraph saying it stays open above its completed answer. Ticket 20 also retains a paragraph calling the recreation race open, although 21 closes it. These are record inconsistencies, not reasons to reopen implementation work.

Tickets 10 and 17 can proceed in parallel with file ownership coordination around benchmark/repository comments. Keep 25 out of the active queue. Do not recreate implementation tickets for 12,18,20,21,22 or24.

## Source anchors

- Changed writes: `src/persistence/sql-space-repository.ts`, comparison and locked baseline at 188 and619.
- Fast path: same module155,506,568; PostgreSQL shared aggregate lock `src/prisma/sql-store.ts:247`.
- Replay/Retry: `packages/persistence/src/session.ts:433`, registry455/523 and coordinated commit434.
- Remaining comment work: `packages/ui/src/ResourceContent.tsx:45`; stale view-source description and PUT endpoint.
- Measurement targets: `scripts/persistence-cost/measure.ts:453`.

## Verification

Fresh checks passed **2,344 distinct tests across 159 files** (overlapping focused runs counted once):

- Persistence/schema/HTTP/SQL decision selection: 456 tests, 18 files.
- SQLite repository contract, aggregate differential and fast-path races: 89 tests, 3 files.
- App/UI/render-adapter selection: 1,630 tests, 129 files, zero act warnings. The focused selection adds 9 non-overlapping HTTP-size/guard tests across 2 files.
- Maintenance selection: 160 tests, 7 files. Four roadmap CLI cases initially failed because the sandbox blocked tsx IPC; the complete 38-test roadmap file passed outside the sandbox.
- Five in-memory lint injections detected forbidden continuation/component/React imports, global-object DOM access and the non-type React import. No production file was changed.
- Toolchain assertion passed: all workspace compilers 7.0.2, library bridge 6.0.3.

The audit does not claim a fresh full verify, PostgreSQL run, application E2E or Ladle run. Historical CI was inspected separately: [PR279 CI](https://github.com/tobyhede/hyper/actions/runs/36075465995) includes successful e2e/Ladle; [PR290 CI](https://github.com/tobyhede/hyper/actions/runs/36104924825) and [PR293 CI](https://github.com/tobyhede/hyper/actions/runs/36113676708) include successful PostgreSQL/SQLite jobs.

Logs: `/private/tmp/cq-persistence-current.log`, `/private/tmp/cq-sqlite-current.log`, `/private/tmp/hyper-audit-ui-broad-now.log`, `/private/tmp/hyper-audit-ui-now.log`, `/private/tmp/hyper-audit-maintenance.log` (the last retains initial sandbox failures; successful roadmap rerun was captured in the tool output).
