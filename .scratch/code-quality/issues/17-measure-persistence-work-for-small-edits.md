# 17: Measure persistence work for small edits

**Priority:** P2 — bounded measurement task

**Status:** ready-for-human. SQLite and memory are measured and the findings below are recorded. The PostgreSQL run is still to do; see Remaining.

**Blocked by:** None

**Problem:** A smaller source file does not make an edit cheaper. `preservesSnapshotBoundary` in `src/persistence/sql-space-repository.ts` compares entire Map documents. Moving one Resource changes that comparison, so the edit goes through the aggregate path, which loads every Space and runs aggregate validation. `#upsertResources` then awaits an upsert for every Resource in the changed Space, unchanged ones included. Whole snapshots also cross the HTTP seam.

**Evidence level:** These operations are visible in source. This audit has not measured their practical latency, their memory cost or the workload they can bear. Do not call this a measured regression.

**What to build:** A repeatable, bounded benchmark that separates the dimensions of the workload and reports where the work goes. Use PostgreSQL as the principal database measurement, and reuse the shared repository seam for statement counts where that helps. This is distinct from the existing embedded-canvas drag benchmark, which measures rendering rather than durable commits.

- [x] Compare title/body edits, a settled position change, an Open/Resize, and a topology-changing edit
- [x] Vary Resources within the edited Space separately from the number and size of unrelated Spaces
- [x] Report serialized request bytes, database statement count, aggregate reads and end-to-end commit latency with repeated samples and environment details. Done on SQLite and memory; PostgreSQL is outstanding.
- [x] Include the 1 MiB request limit when describing the valid workload range; an oversized rejected request is not a successful performance sample
- [ ] Check normal commits and revision conflicts; record whether aggregate locking affects independent Space edits. Commits and conflicts are measured. The locking question needs PostgreSQL: SQLite serialises every commit per file handle whatever path it takes, so it cannot answer it.
- [x] Produce a short decision: acceptable within the measured range, or a ranked optimization with a measured benefit hypothesis
- [x] Any proposed fast-path widening states which cross-Space invariants still hold and identifies differential/concurrency tests needed before implementation

Do not introduce a delta protocol, cache, batching policy, CI timing threshold or second repository in this ticket. File implementation work only where the measurements justify it.

## Method

The harness is `scripts/persistence-cost/measure.ts`, with scenarios and Edits in `scripts/persistence-cost/scenarios.ts`. It is a diagnostic: it asserts no threshold and nothing runs it in `verify` or CI. To reproduce, run from the repository root:

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
- **Environment.** Apple M2 with 8 logical CPUs, Node v26.8.1, darwin 25.4.0. Load average was **75–149** during the final run. **All wall-clock numbers are unreliable** and serve only as orders of magnitude. The counts are deterministic: every repeated sample gave identical statement, row and parse counts, except Add Resource, which grows the Space on each sample.

PostgreSQL was not measured. No PostgreSQL configured for this checkout was running, and the containers that were running belong to other checkouts and projects.

## Numbers (SQLite, `SqlSpaceRepository`)

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

## Numbers (memory, `MemorySpaceRepository`)

No fast path. Every commit runs `decideCommit` over every stored Space, for 2S + 1 snapshot parses: 5 with no unrelated Spaces, 25 at U = 10 and 85 at U = 40. Conflicts run S + 1. The memory repository serves only development and E2E runs, so no work is filed for it.

## Request size and the 1 MiB limit

Request bytes depend only on the edited Space, roughly 870 bytes per Resource at 600-character bodies:

| body | N = 10 | N = 100 | N = 1000 | largest N whose Open commit fits |
|---|---|---|---|---|
| empty | 3,309 | 29,328 | 292,222 | 3,568 |
| 600 characters | 9,168 | 87,836 | 876,329 | 1,196 |
| 4,000 characters | 43,168 | 427,836 | 4,276,329 | 245 |

A 1,500-Resource Space (1,315,039 bytes) was answered 413 with no statements and no parses. It is reported as a refusal, not as a sample. The valid range for this workload therefore ends at about 1,200 Resources per Space at 600-character bodies, and at about 245 at 4,000-character bodies.

## Findings

1. **Rename and body Edits take the fast path. Move, Open, Resize, Add Edge and Add Resource take the aggregate path.** Any byte of change in `document.maps` leaves the fast path, as the source suggested. The measured consequence is reads and parses that grow with the **whole aggregate**, not the edited Space: 4 against 4,098 rows, and 30 against 12,183 parsed Resource documents, for a 10-Resource Space beside 40 × 100. The statement count barely moves (18 against 22), so counting statements alone hides this.
2. **Every commit rewrites every Resource in the edited Space** (`#upsertResources`). Statements are N + 8 or N + 12 on either path, and about twice the request's bytes are bound as parameters. At N = 1000 one rename is 1,008 statements.
3. **The fast path's candidate read and two parses are wasted whenever the aggregate path follows**, which is 3 of the 5 common Edit kinds. This is a small constant; nothing is filed for it.
4. **Conflicts are cheap on SQL** (1 statement) and return a whole Space. That is acceptable.
5. **The 1 MiB limit bounds a Space, not an Edit.** Once a Space's snapshot passes it, every commit to that Space is refused.
6. **Client side, from source only and not measured:** `assertValidAuthoredSnapshot` in `packages/app/src/space-authoring.ts` runs `loadSpaceSnapshot` over the whole Space once per Edit, and `SpaceSession` `structuredClone`s the snapshot on submit (`packages/persistence/src/session.ts`).

## Decision

**Acceptable within the measured range:** Spaces of up to about 100 Resources, in aggregates of up to about 1,000 Resources in all. There every commit reads fewer than about 1,200 rows and issues about 110 statements. The measured cost grows along two independent axes, each worth an optimisation. Ranked:

1. **Write only changed Resources** (ticket 20). This affects every commit on both paths. Benefit hypothesis: a one-Resource Edit drops from N + 8 / N + 12 statements to 9 / 13 at any N, for example 1,008 → 9 at N = 1000.
2. **Keep Map-internal Edits on the fast path** (ticket 21). This affects move, Open, Resize and Add Edge, the most frequent interactive Edits. Benefit hypothesis: reads and parses stay at 4 rows and 3 parses however large the aggregate grows, instead of 4,098 rows and 129 parses at 40 × 100. Ticket 21 records the cross-Space invariants the widening keeps, and the differential and concurrency tests required before it is built.
3. **Decide what a Space past the commit limit means** (ticket 22). This needs a decision, not an optimisation.

## Remaining

- Run the harness against PostgreSQL. It needs a `postgresSqlStore` target with the same middleware, and a cleared database per scenario (`test/support/clear-sql-content.ts`).
- On PostgreSQL, record whether the aggregate path's `pg_advisory_xact_lock` serialises commits to *independent* Spaces. By the source it should: every aggregate-path commit takes the same advisory lock, and fast-path commits take none. The harness would need two concurrent clients to show it.
