# 25 — Repository behaviour lives in the contract

**What to build:** Every behaviour the one SQL repository shares across databases is asserted once, in `test/support/repository-contract.ts`, and each database's own integration file holds only what genuinely differs: its concurrency and contention.

**Blocked by:** None.

**Status:** resolved

**Tags:** release/v1

**Audited:** 2026-09-20 against `b1ac983d`. Ticket 24 is resolved; the shared repository is built, but the test consolidation below remains open. Ticket 26 follows this work and joins the final release proof.

**Why:** With one implementation, `postgres-space-repository.test.ts` and `sqlite-space-repository.test.ts` still restate portable repository behaviour beside `test/support/repository-contract.ts`. Use test descriptions to inventory the remaining duplication; the line counts and offsets recorded when this ticket was filed have moved with subsequent regression coverage.

- [x] Extend the existing contract harness with the missing reopen and corrupt-document arrangements. It already supplies `writeRawRevision` and a missing-Meta arrangement; reuse those capabilities rather than creating parallel raw-storage hooks. SQL-only arrangements may remain unavailable to memory, with those skips explicit.
- [x] Move remaining portable cases into the contract: truncation of broken stored state (ADR 0094), survival across reopen, and intake cases still held only by PostgreSQL. Preserve the shared revision and missing-Meta regressions already present.
- [x] Restated cases are deleted from the per-database files rather than kept beside the contract.
- [x] What remains per database is its concurrency: PostgreSQL's row-lock and isolation cases, and `sqlite-contention.test.ts`.
- [x] The delete loop written in `test/support/clear-hyper-content.ts` and `clear-sqlite-content.ts` exists once. Preserve SQLite's id-only reads and count-only deletes: reading or returning a whole row can decode the malformed JSON this cleanup must remove.
- [x] Extend the browser steps already shared through `test/support/restart-proof.ts` to cover the duplicated fixture aggregate, export/revision assertions and cleanup. Keep database-specific host/connection sequencing explicit; sharing those steps must not make SQLite open a second connection while its host owns the file. Configuration belongs to ticket 26.

Out of scope: host composition (26).

## Answer

The shared repository contract now owns every portable lifecycle, commit, intake,
reopen and broken-state behaviour. SQL-only arrangements are explicit harness
capabilities, so memory skips states it cannot represent rather than growing a
fake raw-storage seam. PostgreSQL and SQLite integration files retain their real
engine differences: locking and concurrency, raw malformed storage, foreign-key
behaviour, and SQLite connection pragmas.

The two SQL cleanup adapters now share one id-only/count-only deletion loop, so
cleanup still removes malformed JSON without decoding it. The PostgreSQL and
SQLite restart proofs share fixture construction, export and revision assertions,
and temporary-directory cleanup while preserving SQLite's one-open-connection
sequence.
