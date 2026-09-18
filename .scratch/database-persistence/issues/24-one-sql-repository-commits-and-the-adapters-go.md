# 24 — One SQL repository commits, and the two adapters go

**What to build:** `commit` runs on the one SQL Space repository for both databases, and `PostgresSpaceRepository` and `SqliteSpaceRepository` are deleted with their private copies of `ThingOwnershipError`, `StaleSpaceRevisionError` and the catch that maps them to outcomes.

**Blocked by:** 20 — One commit decision for every implementation; 23 — One SQL repository owns the Meta lifecycle.

**Status:** ready-for-agent

**Why:** ADR 0095. Each adapter repeats the same procedure around the shared decision — identity refusal, transaction, fast-path decision, write under the row lock and revision comparison, otherwise Meta lock, complete load, `decideCommit`, write loop, then outside the transaction a stale revision answered as `conflict` from a fresh read and an owned Thing answered as `rejected`. The comments on that procedure place its bugs in the comparison under the lock and in the outcome mapping, which is exactly what each adapter copies.

- [ ] One commit procedure in the repository: `commitIdentityRefusal` first, then the fast path for a single structure-preserving update, otherwise the complete-aggregate path through `decideCommit`. `src/persistence/topology-preserving-update.ts` (ticket 20) is absorbed into the repository.
- [ ] An update is written by **one helper** used by both paths, not one statement. It keeps today's statement order: write the document to take the row lock and return the revision the row carried when the lock was granted, compare it, then write the new revision, then the Things, then delete Things the snapshot dropped (which removes nothing on the fast path). A single `UPDATE` that sets the revision returns the new value, not the one it replaced, so the two writes stay separate.
- [ ] The repository compares that revision and throws its private stale-revision error to roll back; outside the transaction it answers `conflict` from a fresh `loadSpace`, never a read inside the rolled-back transaction.
- [ ] Both adapters already answer an owned-Thing collision met by a write as `rejected` / `invalid-commit` rather than letting it escape as 503. The one repository keeps that, from one declaration of the error.
- [ ] The whole `spaceRepositoryContract` commit group passes on both databases; `sqlite-contention.test.ts` and PostgreSQL's concurrency tests still pass.
- [ ] `aggregate-commit-differential.test.ts` runs against both databases.
- [ ] Both adapter modules are deleted and every import site — HTTP runtimes, CLI entries, tests, `test/support` — uses the one repository with its database's `SqlStore`.
- [ ] `src/cli/run.ts`'s conflict comment stops explaining itself through one adapter's internals.
- [ ] `AGENTS.md` and `docs/agents/editing-and-persistence.md` name the one repository where they named either adapter.

Out of scope: moving per-database tests into the contract (25); host composition (26); naming database contention as its own outcome.

Note (ticket 28): `decideCommit`'s `write` decision now also carries `spaces` — every stored Space the commit produces, ascending by id. The one SQL repository this ticket builds writes rows and deliberately ignores it, the same as both adapters do today.
