# 20: Write only the Resources a commit changed

**Priority:** P2 — measured cost that grows with every Resource in the edited Space

**Status:** resolved

**Blocked by:** None

**Problem:** `#writeUpdate` in `src/persistence/sql-space-repository.ts` calls `#upsertResources`, which upserts every Resource in the submitted snapshot whether or not it changed. Both commit paths go through it.

**Evidence (ticket 17, `scripts/persistence-cost/measure.ts`, SQLite, 600-character bodies):** a rename of one Resource in a Space of N Resources executes `N + 8` statements. At N = 1000 that is 1,008 statements, of which 1,000 are `INSERT … ON CONFLICT DO UPDATE` upserts, carrying 1,694,116 parameter bytes for an 876,280-byte request. The document is bound twice per upsert, once for the insert and once for the update. The count depends only on N: every Edit kind and every aggregate size measured gives the same `N + 8` fast-path and `N + 12` aggregate-path statement counts.

**Benefit hypothesis:** writing only new and changed Resources makes a one-Resource Edit cost 9 statements on the fast path and 13 on the aggregate path, at any N, and drops the parameter bytes to about twice the changed documents. Re-run the harness to confirm.

**What to build:** compare the submitted Resources with the stored ones the commit has already read, and upsert only the new and changed Resources. The fast path has the stored Space from `#loadStoredSpaceRowForCommit`. The aggregate path has it from `#loadEverySpace`. Keep `deleteExcept` as it is.

**Invariants that must still hold:**

- **Resource ownership.** `#upsertResources` reads back `spaceId` and raises `ResourceOwnershipError` when the row belongs to another Space. An unchanged Resource is one this Space's own rows hold. A new Resource id, and a Resource moving between Spaces, still go through the checked upsert.
- **Stale revisions** still throw `StaleSpaceRevisionError` before any Resource is written.

- [x] Only new or changed Resources are upserted; the ownership check still covers every new id
- [x] `test/support/repository-contract.ts` and both aggregate-commit differentials pass on SQLite, and on PostgreSQL in CI. CI run 36099949806 on PR #290 passed its `postgres` and `sqlite` jobs at 6193dd9e, which includes the re-read of the Resource rows under the row lock and the contract cases that recreate them before it.
- [x] A test proves a changed Resource is persisted, and an unchanged one is not rewritten, by counting statements or reading `updated_at`
- [x] The ticket 17 harness is re-run, and the before and after numbers are recorded here

## Answer

**Design.** `changedResources(stored, next)` in `src/persistence/sql-space-repository.ts` is a pure function: it answers the Resources of the submitted snapshot that the stored rows do not hold, or whose document is not `isDeepStrictEqual` to the stored one. `#writeUpdate` takes the row lock and checks the revision as before, then reads the Space's Resource rows again through `Space.loadWithResources`, and passes only the changed Resources to `#upsertResources`. Both commit paths go through it. `deleteExcept`, the write order and the store contract are unchanged: no `SqlStore` or `SqlTables` member was added.

The stored side is each row's document decoded from its column (`readDocument`) and not parsed, so a Resource left out is one whose row already holds exactly the proposed document. A comparison that says "changed" when nothing changed costs one upsert and nothing else, so the comparison errs that way.

**Why the baseline is read under the lock (review finding R1).** The first build compared against the Resources the commit read before the lock. A revision comparison cannot see a Space deleted and recreated at the same revision in between, which `replaceAggregate` does when it recreates Spaces at revision 0. On PostgreSQL, READ COMMITTED lets the fast path's unlocked read predate a replacement that commits before the row lock is granted. A commit expecting revision 0 then passed the revision check, skipped Resources against the obsolete read, and reported `committed` while storing its document over the replacement's Resource rows. That could leave the Map placing a Resource with no row. Before this ticket every Resource was upserted, so the submitted snapshot was stored whole. The complete-aggregate path reads under the aggregate lock that `replaceAggregate` and `initializeAggregate` also take, through `#lockMetaIdentity`, so it had no such window. It shares `#writeUpdate`, so it re-reads too, which costs one statement.

**Invariants, and what holds them.**

- *Ownership.* A Resource the stored Space did not hold is always written through the checked upsert. That covers a new id and a Resource moving in from another Space. The contract cases `moves an unchanged Resource between Spaces in one commit` (every repository) and `writes a moved Resource through the ownership check, which refuses it before its Space releases it` (SQL only) hold this. In the second, the receiving Space comes first in the change set, and the commit is still `rejected` / `invalid-commit` and rolled back.
- *Stale revisions write nothing.* The row-lock revision comparison still comes before the Resource writes. `refuses a fast-path / complete-aggregate-path commit whose row moved before the lock, writing no Resource` (`test/integration/sqlite-space-repository.test.ts`) moves the row between the read and the lock and asserts that no upsert was issued. The contract case `writes no Resource for a commit at a stale revision` covers the ordinary conflict answer.
- *A skipped Resource's row already holds what the commit proposes.* The Resource rows are read after the row lock is taken and the revision holds, so the comparison is against the rows as they stand, not as the commit read them. The contract case `stores a topology-preserving / complete-aggregate commit's whole snapshot over Resource rows recreated before its row lock` holds this. Its SQL harnesses replace the Space's Resource rows inside the commit's transaction, just before `writeDocumentUnderLock` (`recreatingBeforeRowLock` in `test/support/repository-contract.ts`). They change one Resource the commit leaves as it read it and drop another that the commit's Map places. Against the pre-lock baseline both cases reported `committed`, and the next `loadSpace` failed intake: `Map "…021" holds a position for resource "…011", which the space does not hold`.
- *The recreation window is closed in ticket 21 (PR #293).* A fast-path commit that fell between a `replaceAggregate` and its row lock used to overwrite the recreated Space unvalidated. Ticket 21's shared aggregate lock serialises the fast path against aggregate decisions, so an unchanged revision under the row lock now proves the Space is the one that was read.

**Tests.** The SQL harnesses build their repository over `recordResourceWrites` (`test/support/record-resource-writes.ts`). It wraps the database's own `SqlStore` and records every `Resource.create` and `Resource.upsert` by id, which are the only members that write a Resource row. The memory harness has no rows and skips these cases through `context.skip()`. The new contract cases are the two recreation cases above, `writes only the Resource a topology-preserving commit changed` (a rename writes one row; a Space title change writes none), `writes only the new and changed Resources on the complete-aggregate path` (a Map change plus a renamed and an added Resource writes exactly those two), the stale and move cases above, and two SQLite cases for a row that moved under the lock. Run against the previous repository, three cases fail: the two counting cases, and the moved-Resource case, whose count shows every Resource written. The stale, move and moved-row cases pass on both, and serve as regression guards.

**Measurement.** Method as in ticket 17: `pnpm exec tsx scripts/persistence-cost/measure.ts`, the full matrix, 5 samples per Edit, SQLite and memory, on the same Apple M2 with Node v26.8.1. The load average was 6.8–13 during both runs, much lower than in ticket 17's run, but the latencies are still only orders of magnitude. The counts are deterministic.

| Edit (edited Space of N) | path | statements before → after | rows written before → after | parameter bytes written at N = 1000, before → after |
|---|---|---|---|---|
| rename, body | fast | N + 8 → **9** (1,008 → 9 at N = 1000) | N + 2 → 3 | 1,694,116 → 220,815 |
| move, Open, Resize, Add Edge | aggregate | N + 12 → **12** | N + 3 → 3 | 1,694,288 → 219,388 |
| Add Resource | aggregate | N + 13 upward → **13** | N + 4 upward → 4 | 1,695,543 → 220,643 (first sample) |
| stale revision | fast (answer) | 1 → 1 | 0 → 0 | 0 → 0 |

Move, Open, Resize and Add Edge change only `document.maps`, so they write no Resource at all. That is why they come in at 12 statements rather than the hypothesised 13. The parameter bytes left over are almost all the Space document, written once under the row lock; its Map positions grow with N. Rows read, snapshot parses and parsed Resource documents did not change in any scenario. The aggregate path's reads over the whole aggregate are ticket 21's concern. The memory repository has no statements and its counts did not change.

**Re-run after the re-read under the row lock.** Same command, `PERSISTENCE_COST_SAMPLES=1`, on the same machine, with the load average reaching 144 while other work ran, so its latencies say nothing. Each committed update now costs one more statement, a `select resources` read of the edited Space's rows: rename and body **10**, move, Open, Resize and Add Edge **13**, Add Resource **14**, at N = 10, 100 and 1000 alike. Rows written and parameter bytes written are unchanged (at N = 1000: 220,815 for rename, 219,387 for move, 220,025 for Add Resource). The stale revision is still 1 statement: it is refused before the lock. The table above is the first build's and is kept as measured.

Latency, unreliable: at N = 1000 with nothing beside it, rename went from 208 ms to 31 ms (median) and move from 126 ms to 53 ms. At N = 10, the times stayed within noise.
