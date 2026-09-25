# 20: Write only the Resources a commit changed

**Priority:** P2 — measured cost that grows with every Resource in the edited Space

**Status:** resolved on SQLite; the PostgreSQL half of the contract and differential runs in CI's `postgres` job, which this checkout did not run locally.

**Blocked by:** None

**Problem:** `#writeUpdate` in `src/persistence/sql-space-repository.ts` calls `#upsertResources`, which upserts every Resource in the submitted snapshot whether or not it changed. Both commit paths go through it.

**Evidence (ticket 17, `scripts/persistence-cost/measure.ts`, SQLite, 600-character bodies):** a rename of one Resource in a Space of N Resources executes `N + 8` statements. At N = 1000 that is 1,008 statements, of which 1,000 are `INSERT … ON CONFLICT DO UPDATE` upserts, carrying 1,694,116 parameter bytes for an 876,280-byte request. The document is bound twice per upsert, once for the insert and once for the update. The count depends only on N: every Edit kind and every aggregate size measured gives the same `N + 8` fast-path and `N + 12` aggregate-path statement counts.

**Benefit hypothesis:** writing only new and changed Resources makes a one-Resource Edit cost 9 statements on the fast path and 13 on the aggregate path, at any N, and drops the parameter bytes to about twice the changed documents. Re-run the harness to confirm.

**What to build:** compare the submitted Resources with the stored ones the commit has already read, and upsert only the new and changed Resources. The fast path has the stored Space from `#loadStoredSpaceRowForCommit`. The aggregate path has it from `#loadEverySpace`. Keep `deleteExcept` as it is.

**Invariants that must still hold:**

- **Resource ownership.** `#upsertResources` reads back `spaceId` and raises `ResourceOwnershipError` when the row belongs to another Space. An unchanged Resource was read as belonging to this Space. The stored Space was read before `writeDocumentUnderLock` took the row lock. When the revision is still `expectedRevision` under that lock, no commit to this Space came in between. So the Space's own Resources are as read. A new Resource id, and a Resource moving between Spaces, still go through the checked upsert.
- **Stale revisions** still throw `StaleSpaceRevisionError` before any Resource is written.

- [x] Only new or changed Resources are upserted; the ownership check still covers every new id
- [x] `test/support/repository-contract.ts` and both aggregate-commit differentials pass on SQLite, and on PostgreSQL in CI. SQLite passed locally; PostgreSQL passed in CI's `postgres` job on PR #290 (run 36085894541).
- [x] A test proves a changed Resource is persisted, and an unchanged one is not rewritten, by counting statements or reading `updated_at`
- [x] The ticket 17 harness is re-run, and the before and after numbers are recorded here

## Answer

**Design.** `changedResources(stored, next)` in `src/persistence/sql-space-repository.ts` is a pure function: it answers the Resources of the submitted snapshot that the stored Space does not hold, or whose document is not `isDeepStrictEqual` to the stored one. `#writeUpdate` now takes the stored Space's Resources and passes only those to `#upsertResources`. The fast path hands it the Space `#loadStoredSpaceRowForCommit` already read; the aggregate path hands it the Space from `#loadEverySpace`, which `decideCommit` has already matched by revision. `deleteExcept`, the write order and the store contract are unchanged: no `SqlStore` or `SqlTables` member was added.

A comparison that says "changed" when nothing changed costs one upsert and nothing else, so the comparison errs that way. The stored side is intake's parse of the row, which is what every reader gets back, so a Resource left out reads back as the commit proposed it.

**Invariants, and what holds them.**

- *Ownership.* A Resource the stored Space did not hold is always written through the checked upsert. That covers a new id and a Resource moving in from another Space. The contract cases `moves an unchanged Resource between Spaces in one commit` (every repository) and `writes a moved Resource through the ownership check, which refuses it before its Space releases it` (SQL only) hold this. In the second, the receiving Space comes first in the change set, and the commit is still `rejected` / `invalid-commit` and rolled back.
- *Stale revisions write nothing.* The row-lock revision comparison still comes before the Resource writes. `refuses a fast-path / complete-aggregate-path commit whose row moved before the lock, writing no Resource` (`test/integration/sqlite-space-repository.test.ts`) moves the row between the read and the lock and asserts that no upsert was issued. The contract case `writes no Resource for a commit at a stale revision` covers the ordinary conflict answer.
- *Unchanged Resources are as read.* On the aggregate path, the stored Spaces are read under the store's aggregate lock. Every replacement, initialization, creation and deletion takes that same lock, so the Space cannot be recreated between the read and the write. On the fast path, the argument is the ticket's: the revision is still `expectedRevision` under the row lock, and every update advances it. **One gap, for review:** a revision comparison cannot see a Space that was deleted and recreated at the same revision. That happens when `replaceAggregate` recreates Spaces at revision 0, or when a delete is followed by a create. Two cases can fall into the gap. The first is PostgreSQL, whose READ COMMITTED lets the fast path's unlocked read predate a replacement that commits before the row lock is taken. The second is a SQLite writer on another file handle, which contention usually refuses. The fast path already trusts this comparison for the document it writes: before this change, a commit that fell into the gap overwrote the recreated Space with its own snapshot, unvalidated against the new aggregate. After it, the commit can also leave that Space's unchanged-looking Resource rows as the replacement wrote them. Both outcomes need a replacement with matching ids to commit inside one commit's read-to-lock window. Closing the gap would take either a row version that a recreation cannot repeat, or a second read under the lock. Both are follow-ups, not part of this ticket.

**Tests.** The SQL harnesses build their repository over `recordResourceWrites` (`test/support/record-resource-writes.ts`). It wraps the database's own `SqlStore` and records every `Resource.create` and `Resource.upsert` by id, which are the only members that write a Resource row. The memory harness has no rows and skips these cases through `context.skip()`. The new contract cases are `writes only the Resource a topology-preserving commit changed` (a rename writes one row; a Space title change writes none), `writes only the new and changed Resources on the complete-aggregate path` (a Map change plus a renamed and an added Resource writes exactly those two), the stale and move cases above, and two SQLite cases for a row that moved under the lock. Run against the previous repository, three cases fail: the two counting cases, and the moved-Resource case, whose count shows every Resource written. The stale, move and moved-row cases pass on both, and serve as regression guards.

**Measurement.** Method as in ticket 17: `pnpm exec tsx scripts/persistence-cost/measure.ts`, the full matrix, 5 samples per Edit, SQLite and memory, on the same Apple M2 with Node v26.8.1. The load average was 6.8–13 during both runs, much lower than in ticket 17's run, but the latencies are still only orders of magnitude. The counts are deterministic.

| Edit (edited Space of N) | path | statements before → after | rows written before → after | parameter bytes written at N = 1000, before → after |
|---|---|---|---|---|
| rename, body | fast | N + 8 → **9** (1,008 → 9 at N = 1000) | N + 2 → 3 | 1,694,116 → 220,815 |
| move, Open, Resize, Add Edge | aggregate | N + 12 → **12** | N + 3 → 3 | 1,694,288 → 219,388 |
| Add Resource | aggregate | N + 13 upward → **13** | N + 4 upward → 4 | 1,695,543 → 220,643 (first sample) |
| stale revision | fast (answer) | 1 → 1 | 0 → 0 | 0 → 0 |

Move, Open, Resize and Add Edge change only `document.maps`, so they write no Resource at all. That is why they come in at 12 statements rather than the hypothesised 13. The parameter bytes left over are almost all the Space document, written once under the row lock; its Map positions grow with N. Rows read, snapshot parses and parsed Resource documents did not change in any scenario. The aggregate path's reads over the whole aggregate are ticket 21's concern. The memory repository has no statements and its counts did not change.

Latency, unreliable: at N = 1000 with nothing beside it, rename went from 208 ms to 31 ms (median) and move from 126 ms to 53 ms. At N = 10, the times stayed within noise.
