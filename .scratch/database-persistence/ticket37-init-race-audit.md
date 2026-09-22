# Ticket 37 initialization-race audit — 2026-09-22

Audited checkout: `marker-cache`, `95e260953f688931b9686efc07e77de876fecc6b`, with parent fix `021710ac`. The checkout was clean. This is an audit, not an implementation of the proposed ticket 42.

**Verdict: the race is real, predates ticket 37, and can delete a concurrent winner's aggregate. The handoff understates its scope: replacement and aggregate reads are also affected. Keep the marker-cache fix; repair the repository's concurrency separately.**

## Independently reproduced

Used a new disposable PostgreSQL 17.11 container, bound only to an OS-assigned loopback port, with its own empty database and tracked migrations. `SHOW default_transaction_isolation` returned `read committed`. No existing container or dev server was modified. This container used trust authentication, so this audit does not measure SCRAM timing.

The diagnostic harness constructed real Prisma Next 0.16.0 PostgreSQL runtimes, `postgresSqlStore` values and `SqlSpaceRepository` instances. A wrapper around the slow caller's table methods paused only **after the actual SQL operation completed**, without modifying its result. The other repository then initialized and committed a valid one-Space, mapless Meta aggregate; releasing the barrier resumed the slow caller. Different proposals used different Meta UUIDs and titles, so replacement of the winner was observable in a subsequent real `loadAggregate`.

| Slow operation and pause boundary | Observed result after the winner committed | Effect |
| --- | --- | --- |
| Initialize, after `RepositoryState.read` returned null | `Stored Spaces exist without a Meta Space` | False invariant failure; winner retained |
| Initialize, after `Space.loadEvery` returned empty | Both callers returned `initialized` | Winner deleted; loser's different Meta stored |
| Initialize, after `RepositoryState.delete` completed against empty state | `repository_state_meta_space_id_fkey` violation | Transaction rolled back; winner retained |
| Replace with expected Meta undefined, after `RepositoryState.read` returned null | `replaced` | Newly initialized winner deleted despite its different Meta identity |
| Load aggregate, after `RepositoryState.read` returned null | `Stored Spaces exist without a Meta Space` | Healthy committed aggregate falsely reported invalid |
| Initialize an identical proposal, after `RepositoryState.read` returned null | Same invariant error | Reproduces the canonical-proposal CI symptom |

All six cases reproduced with **both** `verifyMarker: false` and `'onFirstUse'`. The first five cases reproduced across four completed probe runs; the identical-proposal case across three. No timing sleeps were used to arrange these interleavings. Sequential initialization controls passed for both modes: first proposal `initialized`, identical proposal `existing`, different proposal `already-initialized`.

The diagnostic command was:

```sh
DATABASE_URL=postgres://hyper@127.0.0.1:32768/hyper pnpm exec vitest run --config .scratch/database-persistence/audit-ticket37/vitest.config.ts
```

Final run: **13 failed, 5 passed, 1.49 seconds**. Twelve failures assert correct race behavior against currently broken code; the thirteenth is the marker-on negative control below. The temporary harness was deleted after writing this report, as required by `docs/agents/build-tooling.md`. The boundary descriptions above specify how to reconstruct regression tests. Captured output remains at `/tmp/hyper-ticket37-audit-results.txt` for this session.

## Marker fix and pool claim

Independently tested two direct reads against one TCP server that counts and immediately closes connections:

| Marker mode | Connections after first / second read | Identical error object |
| --- | --- | --- |
| false | 1 / 2 | No |
| onFirstUse | 1 / 1 | Yes |

Measured real `pg_stat_activity` after a fresh runtime's first aggregate transaction: marker off left **one** connection, marker on **two**. Thus the claimed pool difference is verified. Its specific effect on probabilistic failure rates, and the handoff's approximately 7 ms SCRAM cost, remain unverified here.

The installed `@prisma-next/sql-runtime/src/sql-runtime.ts` initializes `verifyMarkerPromise`, assigns it once at lines 331–334, and never clears a rejection. Lines 700–732 show missing/mismatched markers only warn; an unsuccessful marker read can still reject. Both repository runtime factories set `verifyMarker: false`. SQLite's installed runtime extends `SqlRuntimeBase` and forwards the option; SQLite outage recovery was not dynamically exercised in this audit.

`pnpm exec vitest run test/unit/postgres-unreachable.test.ts test/unit/database-startup.test.ts` passed **37/37** tests. The one-server outage test and startup tests using `postgresOptionsFor` are present as described. The ticket 37 Answer still describes the superseded free-port handoff test and duplicated SQLite rationale; that documentation is stale relative to `95e26095`.

## Cause and pre-existence

`src/persistence/sql-space-repository.ts:627` returns from `#lockMetaIdentity` without any lock when the singleton row is absent. PostgreSQL's store `serialise` is a pass-through. Under the verified READ COMMITTED isolation, later statements can see a winner that the first read could not.

Initialization checks emptiness at lines 785–786, then calls `#replaceAllSpaces`, which first deletes stored content (lines 729–750). A winner committed between that check and deletion is silently removed. A winner committed after singleton deletion but before Space deletion instead produces the FK failure. A winner committed before the emptiness check produces the invariant failure. The catch at lines 790–807 handles neither latter error, and cannot detect a successful destructive overwrite.

Replacement reads the Meta identity separately from stored rows (lines 820–845). A stale undefined Meta plus newly visible rows can pass its expected-identity check and overwrite the winner. Aggregate loading has the same split read (lines 751–760).

`git diff faac5d7f...HEAD -- src/persistence/sql-space-repository.ts src/prisma/sql-store.ts` is empty. The repository and PostgreSQL store code responsible for these outcomes predates both ticket 37 commits. Reproducing all outcomes with marker checking enabled independently excludes disabling it as a prerequisite.

## CI and limits of the handoff

[PR 260](https://github.com/tobyhede/hyper/pull/260) is open at the audited SHA. The latest [PostgreSQL job](https://github.com/tobyhede/hyper/actions/runs/35587120789/job/106292922679) failed with the stated invariant error at repository line 786 and contract test line 523. The other substantive test jobs succeeded; the aggregate `CI passed` gate also failed, so “all jobs except postgres green” omits that downstream gate.

The earlier run `35582135379` failed its PostgreSQL job on attempt 1 and passed on attempt 2; latest run `35587120789` failed on attempt 1. This verifies two PostgreSQL failures in three attempts across the two branch SHAs. The earlier failed job's exact exception was not re-audited.

Not independently established: the handoff's 6/60, 0/60, 0/25 and other historical loop counts; its 3–5 ms window; its claim about recent main runs; all historical review-ledger decisions; and upstream release/reporting availability. None is needed to establish the deterministic defects. No complete `verify`, full integration suite, browser E2E or Ladle run was performed: this audit changed no application code and used focused probes rather than claiming overall merge readiness.

## Corrective scope

Add a regression for each verified interleaving before implementing a fix. Serialization must work while the Meta row is absent, across independent PostgreSQL runtimes/processes, and protect the affected aggregate reads and replacement decisions as well as initialization. Review every `#lockMetaIdentity` caller, including the full commit path; that path was not dynamically probed here. Preserve the deliberate topology-preserving commit fast path and ticket 29's refusal of genuinely corrupt stored state.

A transaction-scoped advisory lock is a plausible PostgreSQL mechanism, but merely locking two initializers does not protect an unlocked reader or replacement. The lock protocol and its participating operations need explicit design and tests. ADR 0095 requires a reason for a new `SqlStore` member; ADR 0096 keeps lifecycle decisions in the repository. SQLite's shared-handle queue and file-lock behavior need their own verification before declaring a no-op hook sufficient.

Re-enabling marker checks, warming the pool, catching only the invariant/FK errors, or rerunning CI until green does not close the demonstrated overwrite.
