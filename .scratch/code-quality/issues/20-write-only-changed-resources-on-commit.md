# 20: Write only the Resources a commit changed

**Priority:** P2 — measured cost that grows with every Resource in the edited Space

**Status:** ready-for-agent

**Blocked by:** None

**Problem:** `#writeUpdate` in `src/persistence/sql-space-repository.ts` calls `#upsertResources`, which upserts every Resource in the submitted snapshot whether or not it changed. Both commit paths go through it.

**Evidence (ticket 17, `scripts/persistence-cost/measure.ts`, SQLite, 600-character bodies):** a rename of one Resource in a Space of N Resources executes `N + 8` statements. At N = 1000 that is 1,008 statements, of which 1,000 are `INSERT … ON CONFLICT DO UPDATE` upserts, carrying 1,694,116 parameter bytes for an 876,280-byte request. The document is bound twice per upsert, once for the insert and once for the update. The count depends only on N: every Edit kind and every aggregate size measured gives the same `N + 8` fast-path and `N + 12` aggregate-path statement counts.

**Benefit hypothesis:** writing only new and changed Resources makes a one-Resource Edit cost 9 statements on the fast path and 13 on the aggregate path, at any N, and drops the parameter bytes to about twice the changed documents. Re-run the harness to confirm.

**What to build:** compare the submitted Resources with the stored ones the commit has already read, and upsert only the new and changed Resources. The fast path has the stored Space from `#loadStoredSpaceRowForCommit`. The aggregate path has it from `#loadEverySpace`. Keep `deleteExcept` as it is.

**Invariants that must still hold:**

- **Resource ownership.** `#upsertResources` reads back `spaceId` and raises `ResourceOwnershipError` when the row belongs to another Space. An unchanged Resource was read as belonging to this Space. The stored Space was read before `writeDocumentUnderLock` took the row lock. When the revision is still `expectedRevision` under that lock, no commit to this Space came in between. So the Space's own Resources are as read. A new Resource id, and a Resource moving between Spaces, still go through the checked upsert.
- **Stale revisions** still throw `StaleSpaceRevisionError` before any Resource is written.

- [ ] Only new or changed Resources are upserted; the ownership check still covers every new id
- [ ] `test/support/repository-contract.ts` and both aggregate-commit differentials pass on SQLite, and on PostgreSQL in CI
- [ ] A test proves a changed Resource is persisted, and an unchanged one is not rewritten, by counting statements or reading `updated_at`
- [ ] The ticket 17 harness is re-run, and the before and after numbers are recorded here
