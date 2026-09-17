# 25 — Repository behaviour lives in the contract

**What to build:** Every behaviour the one SQL repository shares across databases is asserted once, in `test/support/repository-contract.ts`, and each database's own integration file holds only what genuinely differs: its concurrency and contention.

**Blocked by:** 24 — One SQL repository commits, and the two adapters go.

**Status:** ready-for-agent

**Why:** With one implementation, `postgres-space-repository.test.ts` (1542 lines) and `sqlite-space-repository.test.ts` (634 lines) test the same code twice and drift independently. The architecture review found cases restated from the contract (SQLite 137, 156, 187, 198; PostgreSQL 855, 922, 967, 981, 1015, 1170) and portable cases held by one database only.

- [ ] The contract harness gains a `reopen` hook and a hook that writes raw stored rows, so broken stored state and survival across close can be arranged without a database-specific test.
- [ ] Moved into the contract: truncation of broken stored state (ADR 0092; PostgreSQL 261–400, SQLite 480–566), survival across reopen (SQLite 568, PostgreSQL 583), and the intake cases only PostgreSQL runs (PostgreSQL 1272–1542).
- [ ] Restated cases are deleted from the per-database files rather than kept beside the contract.
- [ ] What remains per database is its concurrency: PostgreSQL's row-lock and isolation cases, and `sqlite-contention.test.ts`.
- [ ] The delete loop written in `test/support/clear-hyper-content.ts` and `clear-sqlite-content.ts` exists once.
- [ ] The two browser restart proofs share their fixture aggregate, export and revision assertions and cleanup through `test/support/restart-proof.ts`, leaving SQLite's one-connection-at-a-time sequencing as their only difference. How each proof obtains its database configuration is ticket 26's, which follows this one.

Out of scope: host composition (26).
