# 42 — Empty repositories do not serialize aggregate transactions

Status: resolved
Tags: Defect

## Problem

`SqlSpaceRepository` locks the Meta identity row before aggregate decisions. An empty repository has no row to lock. PostgreSQL READ COMMITTED then lets later statements see a concurrent initializer's committed Spaces while the decision still carries an absent Meta identity.

The independent [audit](../ticket37-init-race-audit.md) reproduced false invariant errors, a foreign-key failure, two successful initializations with the second deleting the first aggregate, replacement overwriting a newly established different Meta identity, and aggregate loading falsely reporting broken state. All reproduced with marker verification enabled and disabled. This predates ticket 37.

## Authorized implementation

Acquire a stable PostgreSQL transaction-scoped advisory lock before the aggregate Meta identity read and hold it through transaction completion. Every aggregate-locking caller participates: initialization, replacement, aggregate loading and the full commit path. Preserve the topology-preserving commit fast path and the refusal of genuinely invalid stored state.

Expose the database mechanism through the SQL store, without moving lifecycle decisions out of the repository. Verify SQLite's queue and transaction isolation before selecting its implementation. Do not restore marker verification, warm the pool to conceal the race, or merely catch the errors: none prevents the successful overwrite.

## Public seams and verification

The user authorized implementation after the proposed public repository seams: `initializeAggregate`, `replaceAggregate`, `loadAggregate` and `commit`. Use the TDD skill, one failing regression followed by the minimal implementation per cycle. Assertions observe public results and stored content through repository reads. PostgreSQL concurrency tests must use independent runtimes and real transactions, with controlled scheduling rather than sleep-based race probabilities.

- Prove a concurrent initializer cannot overwrite the winner and correctly classifies identical/different proposals.
- Prove a concurrent replacement cannot replace a winner with a different expected Meta identity.
- Prove aggregate loading and full commits do not combine an absent Meta identity with newly committed Spaces.
- Retain the existing fast-path independence and corrupt-state contract cases.
- Run both database integration suites and the normal verification bar.

## Comments

2026-09-22: User requested delegated TDD implementation. Implementation is in progress in the `marker-cache` worktree; the audit report predates the fix and records the original evidence.

2026-09-22: Independent SQLite check ran six deterministic separate-runtime tests on a migrated temporary file, pausing after an actual empty Meta read. All passed (20.55s, output `/tmp/hyper-sqlite-init-review.txt`). With default DELETE journaling, the paused reader prevented the other initializer's commit; that initializer raised `PersistenceUnavailableError`, after which the paused initialization succeeded or its replacement/read returned `uninitialized`. With WAL, the other initializer committed; the paused initializer raised `PersistenceUnavailableError`, while paused replacement/read returned `uninitialized` from their consistent earlier snapshot. A subsequent repository read retained the winning Meta. There was no overwrite or false invariant error. The temporary probe was removed after recording these results.

SQLite therefore needs no additional advisory-lock equivalent for this fix. This does not promise `existing`/`already-initialized` across separate handles: contention can still be unavailable, and the in-process queue remains per handle. This matches [SQLite's documented isolation](https://www.sqlite.org/isolation.html). PostgreSQL's mechanism is [transaction-scoped advisory locking](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS), which is released at transaction completion and does not require a stored row.

## Implementation evidence

The first retained regression, in `test/integration/postgres-aggregate-initialization.test.ts`, paused the first runtime after an actual empty aggregate read and allowed the second runtime to either finish or reach a database lock wait. Its assertions use public initialization results and `loadAggregate`; `pg_stat_activity` is only scheduling evidence. Before the fix both callers returned `initialized` (red, 94ms). With the transaction lock, only one initialized and the other's different proposal returned `already-initialized` (green, 122ms). Root TypeScript 7 typechecking passed after that first slice.

The implementation adds `SqlStore.lockAggregate(handle)` before the Meta identity read in the shared repository. PostgreSQL's handle now carries the transaction's `execute` as well as its ORM, so the advisory lock is acquired on the connection that performs the subsequent decision and writes. The fixed database-local key pair `(1213812818, 1)` identifies Hyper's aggregate independently of whether Meta exists. SQLite's implementation is a no-op for the isolation reasons above.

Prisma Next 0.16.0's public PostgreSQL facade exposes raw expressions but no standalone raw-statement builder. The lock uses its supported aggregate projection over `repository_state`: a separate `count(*)` projection guarantees one result even when that table is empty, and the other projection calls `pg_advisory_xact_lock`. Both expressions are typed through the facade; no AST is fabricated, no transitive package is imported, and no type assertion is added. The query's table read is not the decision's Meta read: that happens in the following statement after the advisory lock has been acquired.

The nontransactional handle retains a working `execute` implementation even though aggregate locking is only called with a transaction handle, consistent with ticket 34's decision against splitting the shared handle/table types or supplying a stub.

## Answer

Implemented in `marker-cache`, retaining ticket 37's `verifyMarker: false`. The shared repository acquires its store's protection before the Meta read in all four aggregate paths. The PostgreSQL transaction-scoped advisory lock works before the first Meta row exists and releases with commit or rollback. The ordinary topology-preserving update path remains outside it. No migration or schema change is needed.

Seven retained PostgreSQL regressions use independent runtimes and real SQL barriers. Each regression group was run against the broken behavior with the new hook call absent, then against the restored fix:

| Case | Red observation | Green observation |
| --- | --- | --- |
| Two different proposals, first already checked emptiness | Both `initialized`; winner overwritten | One `initialized`, one `already-initialized`; successful proposal retained |
| Replacement with absent expected Meta | `replaced` concurrent winner | `uninitialized` before waiting initializer proceeds; winner retained |
| Aggregate read after absent Meta read | False stored-without-Meta error | Consistent `uninitialized`; later read sees initialized aggregate |
| Full commit behind initialization | `rejected` for absent Meta | Evaluates established aggregate and returns precise `ordinary-space-unreferenced` refusal for the submitted unreferenced Space |
| Different initialization proposal after absent Meta read | False stored-without-Meta error | `already-initialized` |
| Identical initialization proposal after absent Meta read | False stored-without-Meta error | `existing` |
| Initializer after deleting absent singleton | Foreign-key violation | `already-initialized`; winning content retained |

The full-commit case deliberately submits an unreferenced ordinary Space: its precise aggregate refusal proves it judged the initializer's completed aggregate, rather than rejecting against absent Meta. Public reads confirm no unwanted Space was stored.

Verification on 2026-09-22:

- `pnpm verify` — passed: TypeScript toolchain assertion, root and package typechecks, UI catalog, ESLint, anti-slop lint, formatting, coverage; 237 test files, 3,011 passed and 13 skipped tests. The initial attempt hit a sandbox IPC restriction; the next found two test-barrier `void` lint errors. Those were changed to the established `Promise.withResolvers<undefined>()` form before the successful full rerun.
- `pnpm test:integration:postgres` — 90/90 tests across eight files passed against an isolated, migrated, SCRAM-authenticated PostgreSQL container, including the wrong-password tests and the existing fast-path/corrupt-state cases.
- `pnpm test:integration:sqlite` — 107/107 tests across seven files passed against an isolated temporary SQLite file, including existing cross-process contention tests.
- Focused PostgreSQL race file — 7/7 passed; each group's red output was independently inspected. Session logs are `/tmp/hyper-init-{race,replacement,load,commit,integrity}-red.txt` and `/tmp/hyper-init-final-green.txt`.
- Independent production and regression review — no correctness blockers. Scheduling queries assume the integration database is exclusive to its sequential suite, as the existing integration configuration requires.
- Browser E2E and Ladle were not run: no UI, rendering, graph logic or stories changed.

The live persistence guide now describes protection of the empty repository. The earlier audit remains a dated record of the unfixed behavior, not a statement that this resolved defect remains open.

Cleanup: the implementation agent stopped its disposable PostgreSQL container, and the temporary SQLite database was removed.
