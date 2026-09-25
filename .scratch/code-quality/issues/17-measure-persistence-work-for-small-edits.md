# 17: Measure persistence work for small edits

**Priority:** P2 — bounded measurement task

**Status:** resolved. PostgreSQL, SQLite and memory are measured on the current code, including aggregate-lock contention between independent clients; see "Current measurement". The findings first recorded here predate tickets 20 and 21 and are kept, labelled, as the historical baseline. One question the contention numbers raise is left for a human under "Open question".

**Blocked by:** None

**Problem:** A smaller source file does not make an edit cheaper. `preservesSnapshotBoundary` in `src/persistence/sql-space-repository.ts` compares entire Map documents. Moving one Resource changes that comparison, so the edit goes through the aggregate path, which loads every Space and runs aggregate validation. `#upsertResources` then awaits an upsert for every Resource in the changed Space, unchanged ones included. Whole snapshots also cross the HTTP seam.

**Evidence level:** These operations are visible in source. This audit has not measured their practical latency, their memory cost or the workload they can bear. Do not call this a measured regression.

**What to build:** A repeatable, bounded benchmark that separates the dimensions of the workload and reports where the work goes. Use PostgreSQL as the principal database measurement, and reuse the shared repository seam for statement counts where that helps. This is distinct from the existing embedded-canvas drag benchmark, which measures rendering rather than durable commits.

- [x] Compare title/body edits, a settled position change, an Open/Resize, and a topology-changing edit
- [x] Vary Resources within the edited Space separately from the number and size of unrelated Spaces
- [x] Report serialized request bytes, database statement count, aggregate reads and end-to-end commit latency with repeated samples and environment details. PostgreSQL, SQLite and memory, on a CI runner.
- [x] Include the 1 MiB request limit when describing the valid workload range; an oversized rejected request is not a successful performance sample
- [x] Check normal commits and revision conflicts; record whether aggregate locking affects independent Space edits. It does: see "Aggregate-lock contention". Fast-path commits to different Spaces do not wait for each other, and every one of them waits for an aggregate-path commit to any Space.
- [x] Produce a short decision: acceptable within the measured range, or a ranked optimization with a measured benefit hypothesis
- [x] Any proposed fast-path widening states which cross-Space invariants still hold and identifies differential/concurrency tests needed before implementation

Do not introduce a delta protocol, cache, batching policy, CI timing threshold or second repository in this ticket. File implementation work only where the measurements justify it.

## Current measurement (PostgreSQL, SQLite and memory, after tickets 20 and 21)

**Code measured:** PR #296's head `dadf6360`, which is `origin/main` `21272c25` plus the harness changes; no repository source differs from `21272c25`. Tickets 20 (write only changed Resources) and 21 (Map-internal Edits on the fast path, shared aggregate lock) are both in it.

**Where and how.** The `Persistence cost` workflow (`.github/workflows/persistence-cost.yml`), run [36125027490](https://github.com/tobyhede/hyper/actions/runs/36125027490), 2026-09-25, artifact `persistence-cost-report`. It is a separate workflow rather than a step in `ci.yml`'s `postgres` job: it is a diagnostic with no threshold, so it must not be able to fail the `ci` gate, and ordinary runs should not pay its ~8 minutes. It runs on any PR that changes `scripts/persistence-cost/**` or the workflow itself, and on demand (`workflow_dispatch`) once merged. It starts the same compose PostgreSQL image the `postgres` job uses (17.5, pinned digest in `compose.yaml`), migrates it, and runs:

- `measure.ts` with `PERSISTENCE_COST_TARGETS=postgres,sqlite,memory` and **20 samples** per Edit kind, after one discarded warm-up commit per scenario, over the same ten workloads as before;
- `contention.ts`, **3 rounds × 6 phases × 10 s**, phases interleaved across rounds.

**Environment.** GitHub-hosted `ubuntu-latest`, 4 logical CPUs (AMD EPYC 7763), Linux 6.17 (Azure), Node v26.8.1. Load average 0.6 at the start of `measure.ts`, 3.8 at the end of `contention.ts`. PostgreSQL runs in Docker on the same VM, reached over loopback TCP; SQLite is a temporary file; the HTTP route is in process as before. A shared cloud VM is noisier than a quiet workstation and quieter than the 75–149 load the historical baseline had: the numbers below are **one run**, and the spread is within that run. A first run (36124520864, same runner type, contention only because the `measure.ts` step failed on a harness defect since fixed) gave contention figures within about 15% of these (fast ×1 78.4 against 69.5 commits/s; fast ×1 + aggregate ×1 14.6 against 13.2), which is the only run-to-run evidence there is.

**Timings** are wall-clock per commit, request encoded to response read, reported as median / p90 (min–max) of 20 samples. **Lock times** come from the runtime's own per-statement `latencyMs`, which has **1 ms resolution**; a `0.0` or `1.0` means "no measurable wait".

**Counts are deterministic** across all 20 samples of every Edit kind and target, except Add Resource, which grows its Space each sample. On PostgreSQL "rows read" is not comparable with SQLite: the one-statement `include` read of a Space and its Resources returns one row per Space there. Parsed Resource documents are the comparable measure of aggregate reads.

### Per commit, PostgreSQL

| Edit | path | statements | snapshot parses | Resource docs parsed | median / p90 ms, N = 10 alone | N = 100 alone | N = 1000 alone |
|---|---|---|---|---|---|---|---|
| rename, body | fast | 11 | 3 | 3N | 9.7 / 11.8 · 8.4 / 9.6 | 14.1 / 17.4 · 13.5 / 17.0 | 89.7 / 113.3 · 87.4 / 89.9 |
| move, Open, Resize, Add Edge | fast | 10 | 3 | 3N | 6.9–7.0 / 7.3–8.5 | 12.2–13.4 / 15.0–15.9 | 88.8–90.9 / 94.1–107.9 |
| Add Resource | aggregate | 15 | 3S + 3 | whole aggregate, 3× | 12.8 / 16.8 | 22.8 / 24.9 | 143.6 / 162.8 |
| stale revision | fast (answer) | 2 | 2 | — | 2.9–3.1 / 3.3–3.6 | 5.2 / 8.1–8.2 | 38.1–38.6 / 39.7–42.8 |

PostgreSQL's fast path is one statement more than SQLite's (11 against 10 for a rename, 10 against 9 for a move): the shared advisory lock, as ticket 21 predicted. A stale revision is 2 statements for the same reason. Rows written are 3 for a rename and 2 for a Map-internal Edit at every N (ticket 20).

A fast-path Edit on a 10-Resource Space costs the same whatever is beside it: rename 6.1–9.7 ms and move 5.7–7.0 ms median (the highest of each in the first scenario the run measured), 3 snapshot parses and 30 Resource documents, beside nothing, 10 × 10, 10 × 100, 40 × 100 and 4 × 1000. An aggregate-path Edit (Add Resource) on the same Space grows with the aggregate:

| beside a 10-Resource Space | Resource docs parsed | PostgreSQL median / p90 ms | SQLite | memory (every commit) |
|---|---|---|---|---|
| nothing | 66–180 | 12.8 / 16.8 | 6.6 / 10.1 | 1.2 / 1.5 |
| 10 × 10 | 396–510 | 15.6 / 20.0 | — | — |
| 10 × 100 | 3,096–3,210 | 51.5 / 54.5 | — | — |
| 40 × 100 | 12,186–12,300 | 170.7 / 180.9 | 162.5 / 189.3 | 112.7 / 131.7 (a move) |
| 4 × 1000 | 12,078–12,192 | 169.8 / 186.0 | 159.4 / 182.2 | 109.6 / 121.8 (a move) |

At N = 1000 the fast path's ~90 ms is the edited Space's own size, not the aggregate's: the ~876 KB request is parsed three times and its document written once. SQLite is ~69 ms there, memory ~42 ms. The memory repository still runs `decideCommit` over every stored Space on every commit, so at 4,000 Resources every Edit, a rename included, is ~110 ms; it serves only development and E2E runs, as before.

A 1,500-Resource Space's commit (1,315,039 bytes) was answered 413 in 1.2 ms with no statement and no parse, on PostgreSQL as on SQLite.

### Aggregate-lock contention

`contention.ts` seeds Meta plus 11 ordinary Spaces of 100 Resources (600-character bodies), 1,100 Resources in all, and runs each client as a separate `contention-worker.ts` process with its own runtime, connection pool and in-process HTTP app. Each client commits to its **own** Space in a closed loop — the next commit as soon as the last is answered — so no two clients can conflict on a revision. A `fast` client moves one Resource per commit. An `aggregate` client alternately adds a Resource and removes it, a membership change that takes the complete-aggregate path, so its Space stays level. Every commit in every phase committed; none was refused.

| phase | client | committed/s per client, median (min–max over clients × rounds) | total committed/s per round | latency ms median / p90 / p99 / max | shared-lock wait ms median / p99 / max | exclusive-lock wait ms median / p99 / max |
|---|---|---|---|---|---|---|
| fast ×1 | fast | 69.5 (69.3–71.9) | 69.3–71.9 | 13.2 / 16.9 / 23.9 / 29.4 | 1 / 1 / 5 | — |
| fast ×4 | fast | 32.5 (31.5–33.4) | 128.7–131.9 | 28.8 / 40.8 / 58.5 / 108.1 | 1 / 5 / 13 | — |
| aggregate ×1 | aggregate | 14.9 (14.8–15.4) | 14.8–15.4 | 64.4 / 74.7 / 86.7 / 107.3 | 1 / 4 / 5 | 1 / 1 / 3 |
| aggregate ×2 | aggregate | 7.8 (7.6–8.0) | 15.4–15.9 | 125.4 / 144.9 / 195.8 / 227.2 | 54 / 73 / 81 | 52 / 76 / 104 |
| fast ×1 + aggregate ×1 | fast | 13.2 (13.0–13.5) | 25.9–26.8 (both) | 73.8 / 85.8 / 105.4 / 124.2 | 56 / 75 / 105 | — |
| | aggregate | 13.1 (12.9–13.3) | | 74.0 / 86.8 / 101.1 / 131.0 | 1 / 6 / 9 | 6 / 15 / 21 |
| fast ×4 + aggregate ×1 | fast | 10.4 (10.2–10.6) | 51.1–51.7 (all) | 95.1 / 117.2 / 141.0 / 175.2 | 60 / 89 / 118 | — |
| | aggregate | 10.0 (9.9–10.1) | | 95.3 / 120.5 / 148.9 / 160.3 | 1 / 10 / 22 | 17 / 41 / 48 |

What it shows:

1. **Fast-path commits to independent Spaces do not serialise on the lock.** Four fast clients wait a median 1 ms and at most 13 ms for the shared lock, and total throughput rises from ~70 to ~130 commits/s. That it does not reach 4 × 70 is the 4-CPU runner, shared by four client processes and PostgreSQL, not the lock: per-commit latency doubles while the lock wait stays at the timer's resolution.
2. **Aggregate-path commits to independent Spaces serialise completely.** Two aggregate clients on different Spaces commit 15.4–15.9 times a second in total, the same as one alone; each waits about one whole aggregate commit (~52 ms) for the exclusive lock, and its fast attempt waits as long for the shared one.
3. **One aggregate-path commit stalls every fast-path commit, to every Space, for its duration.** Beside one aggregate client, a lone fast client falls from 69.5 to 13.2 commits/s and its median latency from 13 to 74 ms, of which 56 ms is waiting for the shared lock. With four fast clients each falls to 10.4/s. The fast and aggregate clients end up in lock-step, at the same rate: PostgreSQL grants the advisory lock in queue order, so an exclusive request waits for the shared holders ahead of it and holds back the shared requests behind it. There is no starvation in either direction.

That is the cost ticket 21 accepted ("fast paths now wait out an in-flight aggregate commit") in exchange for closing the recreation and deletion gaps; this measures it. At this aggregate (1,100 Resources) the wait is one aggregate commit, ~50–65 ms; the aggregate-path time grows with the aggregate (170 ms at 4,000 Resources above), and so does this wait. The closed loop is a worst case: it assumes an aggregate-path commit is always in flight, where in use those are the rarer Edits (adding or removing a Resource, Map or Graph, changing `defaultMap`, a Space Resource's selection, any multi-change commit).

SQLite cannot answer this question and was not measured for it: every write on a file serialises, and a second process's write fails as `SQLITE_BUSY` (503) rather than waiting. `PERSISTENCE_COST_CONTENTION_TARGET=sqlite` runs the phases on SQLite to show that, for a local check of the harness.

### Findings, current code

1. **Fast-path Edits no longer pay for the aggregate** (ticket 21 holds on PostgreSQL). Their parses, statements and latency are flat from an empty aggregate to 4,000 Resources beside the Space.
2. **Every commit writes only what changed** (ticket 20 holds on PostgreSQL): 2–3 rows, 10–11 statements at any N.
3. **What still grows with the edited Space is the whole-snapshot transport and its parses**: ~90 ms for a one-Resource Edit at N = 1000 on PostgreSQL, and a 409 carrying the whole Space (883,203 bytes at N = 1000). No work is filed for it; changing the transport needs its own decision (ticket 22).
4. **What still grows with the aggregate is the aggregate path**, ~40 µs per Resource in the aggregate on this runner (13 ms alone, 170 ms at 4,000), **and, through the exclusive lock, the time every fast-path commit in the repository waits behind it.**
5. **Conflicts are cheap:** 2 statements on PostgreSQL, 1 on SQLite.

### Decision, current code

**Acceptable within the measured range**, on these numbers, for one author or a few: a fast-path Edit is 6–14 ms on PostgreSQL for Spaces up to 100 Resources, whatever the aggregate, and ~90 ms at 1,000; an aggregate-path Edit is under ~65 ms up to about 1,100 Resources in the aggregate and ~170 ms at 4,000. No optimisation is filed. The contention result is the one place the numbers could change that, and it is left as a question rather than decided here.

### Open question

Whether an aggregate-path commit may stall every other author's fast-path commits for its duration is a product and design question, not a measurement. At 1,100 Resources that is ~60 ms per membership change; it grows linearly with the aggregate. If it matters, the candidates each need their own ticket and differential/concurrency tests: take the exclusive lock only for the part of the aggregate decision that needs it; make more Edits fast-path (ticket 21 already names `defaultMap`); or bound the aggregate size. Nothing in this ticket's range makes it urgent.

## Historical baseline (01ba43cd, before tickets 20 and 21)

Everything from here to "Remaining" was measured at `01ba43cd`, the commit that added the harness, whose repository code is its parent `bde05042`: every Resource was upserted on every commit, and every Map change took the aggregate path. It is kept as measured, with two corrections marked below. Tickets 20 and 21 record their own before/after re-runs on SQLite.

### Method (historical)

The harness is `scripts/persistence-cost/measure.ts`, with scenarios and Edits in `scripts/persistence-cost/scenarios.ts`. It is a diagnostic: it asserts no threshold and nothing runs it in `verify` or `ci.yml` (the separate `Persistence cost` workflow now runs it; see "Current measurement", which also covers `PERSISTENCE_COST_TARGETS` and `contention.ts`). To reproduce, run from the repository root:

```sh
pnpm exec tsx scripts/persistence-cost/measure.ts            # full matrix, 5 samples per Edit
PERSISTENCE_COST_QUICK=1 pnpm exec tsx scripts/persistence-cost/measure.ts
PERSISTENCE_COST_TRACE=1 ...                                 # every commit's SQL on stderr
```

- **Seam.** Each commit is a real `POST /api/spaces` against `createSpaceHttpApp`, in process through Hono's `app.request`. The body is exactly what `HttpSpaceBackend` sends, `JSON.stringify(encodeCommitRequest(...))`. The request passes the real size guard, `decodeCommitRequest` and `repository.commit`. There is no network hop.
- **Repositories.** `SqlSpaceRepository` over `sqliteSqlStore`, on a freshly migrated temporary file per scenario, and `MemorySpaceRepository` (`test/support`). Each is seeded through `initializeAggregate`.
- **Statements** are counted by a `@prisma-next/sqlite` runtime middleware (`afterExecute`), which records every executed plan's verb, first-named table, row count and parameter bytes. The driver's own BEGIN/COMMIT are not plans and are not counted. The SQL repository itself is unchanged; the harness builds the database with `src/sqlite/db.ts`'s options plus the middleware.
- **Parses** are counted by wrapping `spaceSnapshotSchema.safeParse` on the shared schema instance. Every complete snapshot intake goes through it: `loadSpaceSnapshot`, `loadSpaceAggregate` and the HTTP decoder. "Resource docs parsed" sums the Resources in each successful parse.
- **Path** is read off the statements. `aggregate` means the commit took the Meta identity lock (`UPDATE repository_state`); `fast` means it wrote without that lock; `fast (answer)` means it answered from the one-Space read.
- **Workload.** One edited Space of N Markdown Resources (N = 10, 100, 1000) with 600-character bodies, on one Map with one chained Graph. Beside it are U unrelated Spaces of R Resources each (0; 10×10; 10×100; 40×100; 4×1000), each referenced from Meta by a Space Resource.
- **Edits.** Rename, body edit, move, Open, Resize, Add Edge and Add Resource on the edited Space, 5 samples each after one discarded warm-up commit. Then a stale-revision rename and a stale-revision move, and a move and a rename on an unrelated 100-Resource Space. The Edits reproduce the kind of document change Space Authoring makes: Open and Resize apply ADR 0093's one-axis displacement to the other Resources. They are not its exact derivation.
- **Environment.** Apple M2 with 8 logical CPUs, Node v26.8.1, darwin 25.4.0. Load average was **75–149** during the final run. **All wall-clock numbers are unreliable** and serve only as orders of magnitude; the current measurement above replaces them. The counts are deterministic: every repeated sample gave identical statement, row and parse counts, except Add Resource, which grows the Space on each sample.

PostgreSQL was not measured at the time; the current measurement above is its first PostgreSQL run.

### Numbers (SQLite, `SqlSpaceRepository`, historical)

Statements and rows written depend only on the edited Space's N and the path taken. Rows read and parses depend on the path and the whole aggregate.

| Edit | path | statements | rows written | parameter bytes written |
|---|---|---|---|---|
| rename, body | fast | N + 8 (18 / 108 / 1,008) | N + 2 | ≈ 2 × request (1,694,116 at N = 1000) |
| move, Open, Resize, Add Edge | aggregate | N + 12 (22 / 112 / 1,012) | N + 3 | ≈ 2 × request |
| Add Resource | aggregate | N + 13 upward | N + 4 upward | ≈ 2 × request |
| stale revision (any Edit) | fast (answer) | 1 | 0 | 0 |

Fast-path statements: one `include` read of the Space with its Resources, one Meta row read, SELECT-then-UPDATE twice on `spaces` (the document, then the revision; the ORM issues a SELECT before each UPDATE), N `INSERT … ON CONFLICT DO UPDATE`, and a SELECT-then-DELETE for dropped Resources. The aggregate path adds a SELECT-then-UPDATE on `repository_state` (the lock) and two full-table SELECTs, one over every Space and one over every Resource.

Reads and parses per commit, for a 10-Resource edited Space:

| beside it | rename (fast): rows read / snapshot parses / Resource docs | move (aggregate): rows read / snapshot parses / Resource docs | median ms, rename / move (unreliable) |
|---|---|---|---|
| nothing | 4 / 3 / 30 | 18 / 9 / 63 | 140 / 21 |
| 10 × 10 | 4 / 3 / 30 | 138 / 39 / 393 | 3 / 8 |
| 10 × 100 | 4 / 3 / 30 | 1,038 / 39 / 3,093 | 5 / 722 |
| 40 × 100 | 4 / 3 / 30 | 4,098 / 129 / 12,183 | 13 / 2,228 |
| 4 × 1000 | 4 / 3 / 30 | 4,026 / 21 / 12,075 | 3 / 433 |

On the aggregate path a commit parses 3S + 3 snapshots: the request decode, the fast path's stored-and-proposed check, `#loadEverySpace`, and `decideCommit`'s baseline and candidate `loadSpaceAggregate`. Each Resource in the aggregate is parsed three times per commit.

A move on an *unrelated* 100-Resource Space beside a 1,000-Resource edited Space read 2,033 rows and parsed 6,348 Resource documents. Editing a small Space pays for the largest Space in the aggregate.

A revision conflict costs 1 statement and 2 parses. Its 409 response carries the whole current Space, about the size of the request: 10,758 bytes at N = 10 and 878,054 at N = 1000.

### Numbers (memory, `MemorySpaceRepository`, historical)

No fast path. Every commit runs `decideCommit` over every stored Space, for 2S + 1 snapshot parses: 5 with no unrelated Spaces, 25 at U = 10 and 85 at U = 40. Conflicts run S + 1. The memory repository serves only development and E2E runs, so no work is filed for it.

### Request size and the 1 MiB limit

Request bytes depend only on the edited Space, roughly 870 bytes per Resource at 600-character bodies:

| body | N = 10 | N = 100 | N = 1000 | largest N whose Open commit fits |
|---|---|---|---|---|
| empty | 3,309 | 29,328 | 292,222 | 3,568 |
| 600 characters | 9,168 | 87,836 | 876,329 | 1,196 |
| 4,000 characters | 43,168 | 427,836 | 4,276,329 | 245 |

A 1,500-Resource Space (1,315,039 bytes) was answered 413 with no statements and no parses. It is reported as a refusal, not as a sample. The valid range for this workload therefore ends at about 1,200 Resources per Space at 600-character bodies, and at about 245 at 4,000-character bodies.

**Qualified (ticket 22):** those are the sizes at which *this* workload's request crosses the limit, not a supported maximum number of Resources. The limit applies to the whole submitted request, including every Space in a coordinated save, so it depends on body lengths and on what else is saved with it. The current run reproduces the same byte counts and limits (1,196 and 245).

### Findings (historical)

1. **Rename and body Edits take the fast path. Move, Open, Resize, Add Edge and Add Resource take the aggregate path.** Any byte of change in `document.maps` leaves the fast path, as the source suggested. The measured consequence is reads and parses that grow with the **whole aggregate**, not the edited Space: 4 against 4,098 rows, and 30 against 12,183 parsed Resource documents, for a 10-Resource Space beside 40 × 100. The statement count barely moves (18 against 22), so counting statements alone hides this.
2. **Every commit rewrites every Resource in the edited Space** (`#upsertResources`). Statements are N + 8 or N + 12 on either path, and about twice the request's bytes are bound as parameters. At N = 1000 one rename is 1,008 statements.
3. **The fast path's candidate read and two parses are wasted whenever the aggregate path follows**, which is 3 of the 5 common Edit kinds. This is a small constant; nothing is filed for it.
4. **Conflicts are cheap on SQL** (1 statement) and return a whole Space. That is acceptable.
5. **The 1 MiB limit bounds a request, not an Edit.** ~~Once a Space's snapshot passes it, every commit to that Space is refused.~~ **Corrected (ticket 22):** a commit over the limit is refused with nothing stored, and a later commit that reduces the content below the limit saves; Retry is offered for `payload-too-large`. A reduction that leaves the request over the limit is refused again.
6. **Client side, from source only and not measured:** `assertValidAuthoredSnapshot` in `packages/app/src/space-authoring.ts` runs `loadSpaceSnapshot` over the whole Space once per Edit, and `SpaceSession` `structuredClone`s the snapshot on submit (`packages/persistence/src/session.ts`).

### Decision (historical)

~~**Acceptable within the measured range:** Spaces of up to about 100 Resources, in aggregates of up to about 1,000 Resources in all. There every commit reads fewer than about 1,200 rows and issues about 110 statements.~~ **Retired:** this range was drawn from pre-20/21 code and from latencies taken at load 75–149 (aggregate-path medians of 0.7–2.2 s), and is superseded by "Decision, current code" above. The ranking below was acted on. The measured cost grew along two independent axes, each worth an optimisation. Ranked:

1. **Write only changed Resources** (ticket 20). This affects every commit on both paths. Benefit hypothesis: a one-Resource Edit drops from N + 8 / N + 12 statements to 9 / 13 at any N, for example 1,008 → 9 at N = 1000.
2. **Keep Map-internal Edits on the fast path** (ticket 21). This affects move, Open, Resize and Add Edge, the most frequent interactive Edits. Benefit hypothesis: reads and parses stay at 4 rows and 3 parses however large the aggregate grows, instead of 4,098 rows and 129 parses at 40 × 100. Ticket 21 records the cross-Space invariants the widening keeps, and the differential and concurrency tests required before it is built.
3. **Decide what a Space past the commit limit means** (ticket 22). This needs a decision, not an optimisation.

## Remaining

Nothing in this ticket. The PostgreSQL run and the contention question it listed are answered above; the question the contention answer raises is under "Open question".
