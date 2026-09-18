# 18 — SQLite contention is classified, not retried as a revision conflict

**What to build:** When two SQLite writers meet, the author sees a classified answer rather than a hung lock or a fake revision conflict. Inside one process, overlapping Edits are serialised (ticket 16) so different-Space writes both succeed and a same-Space stale expected revision conflicts. A second process on the same live file is unsupported (ticket 14's ~5.3s stall was two clients inside **one** process; a second process was never measured); when it happens, BUSY/LOCKED — immediate or exhausted — becomes `persistence-unavailable` with enough time left for the client to receive 503. How the file is journaled, synced, backed up, and located is written down. CI runs SQLite in a temp directory beside PostgreSQL, not instead of it.

**Blocked by:** 16 — SQLite persists authored Edits. Can proceed in parallel with 17.

**Status:** resolved

Rewritten after ticket 14. The first draft required “two runtime instances against one file, different Spaces, both succeed.” That is PostgreSQL row locking. SQLite locks the file; in ticket 14, two independent clients in one process that each `SELECT` then `UPDATE` waited out the driver's 5000ms busy timeout and then both failed, even on disjoint rows. Recovery was clean (no stuck lock, no half-write). That is not a success case to build toward.

**Corrections from the review of 14 (2026-09-16).** (a) One client is not one connection: the pinned driver opens a `DatabaseSync` per `transaction()`, so overlapping transactions through the one runtime contend too, and against 15's committed repository they failed **immediately** (2–9ms `database is locked`), not after 5s. (b) BUSY/LOCKED comes in two shapes sharing one error type, `SqlConnectionError{transient:true}`: *immediate* (SQLite refuses without invoking the busy handler) and *exhausted* (after the 5000ms busy timeout). Classify both as operational, and do not tell them apart by message. Only the exhausted shape spends the timeout budget. (c) Ticket 14 never produced a zero-row *conflict* under contention, nor raced a real truncate-and-replace transaction against a commit; its Scenario 4 was three auto-commit deletes. Both remain to be shown here. (d) Ticket 14's first explanation of the lock sequence was wrong. RESERVED coexists with SHARED; only the PENDING/EXCLUSIVE step to commit waits for readers. Do not build classification on the withdrawn "both wait for the other's SHARED before RESERVED" model.

The contention rows are still open. Add a real `replaceAggregate` racing a commit, a same-Space race that must end in `conflict` (not BUSY) once serialised, and, for two processes, what the wait actually is, measured rather than carried over from the in-process numbers.

Product scope remains one Hyper process per file. In-process overlap is 16's mutex/serialisation. This ticket owns the second-process failure mode, the HTTP mapping, and the operational write-up.

- [x] One process, two overlapping commits (the 16 serialisation): same-Space stale expected revision → `conflict` (409), no write; different-Space writes both succeed in well under the busy timeout; insert-only identity collision → rejection. None of these wait ~5s.
- [x] Two independent runtimes against one live file (a second process, not a second client in this one): BUSY/LOCKED, immediate or exhausted, is a thrown operational failure (`SqlConnectionError` transient, or raw `SQLITE_BUSY`), not a typed revision conflict, and neither a half-write nor a stuck lock remains. Do not assert that both writers succeed.
- [x] The HTTP host maps that operational failure to `persistence-unavailable` (503). The pinned driver's 5000ms busy timeout plus the HTTP/backend timeout still leave a margin so the client receives the 503 rather than timing out. Do not treat BUSY as a 409.
- [x] Journal stays default rollback (`delete` mode) and `synchronous=FULL` as 14 measured. WAL, if adopted later, is not this ticket's default.
- [x] Backup guidance is a quiesced or closed copy (or SQLite's backup API). Copying only the main file while writers are live is not the documented mechanism.
- [x] The database path is a stable absolute path in an application-owned local directory. Parent missing or unwritable fails clearly. Network filesystems, shared files across hosts, hosted SQLite, and a CLI writing a file a live host still holds are out of scope as supported deployments.
- [x] SQLite CI creates an isolated temp directory, emits/checks the contract, migrates, runs the SQLite integration suite (including this contention matrix), verifies the live file, closes every handle, and removes the directory. The existing PostgreSQL job, including its browser durability proof, stays mandatory.
- [x] Increment-4 hardening — WAL/checkpoint policy, configurable busy timeout, `BEGIN IMMEDIATE` if the facade ever exposes it, browser-restart E2E on SQLite, crash/power-loss claims — is out of scope unless a later ticket asks for it.

## Answer

Built as tests and an operator write-up; no production code changed except the SQLite host now refusing to compose without `SQLITE_PATH`. The matrix is `test/integration/sqlite-contention.test.ts`, which the SQLite CI job already runs through `pnpm test:integration:sqlite`.

**One process.** Serialisation (ticket 16) holds for every row, each well under 1s: two overlapping same-Space commits at one expected revision answer `committed` and `conflict`, and the loser writes nothing; two overlapping commits adding one Thing id to two Spaces answer `committed` and `aggregate-refused` — the loser's complete aggregate intake sees the winner's Thing, so the collision is refused in domain terms and never reaches the unique index; `replaceAggregate` racing a commit settles in arrival order (commit first: both land, the replacement wins; replacement first: it lands and the commit is a `conflict` naming a Space that no longer exists). Different-Space commits are ticket 16's existing case. The checklist's identity row said *insert-only* and *rejection*; neither transfers exactly. Two overlapping `create`s of one Space id cannot both be valid change sets — each must also update the Meta Space that links it, so once serialisation lets the winner's write land first, the loser's `decideAggregateCommit` finds every change stale in one pass and answers a revision `conflict` naming both the created Space id and Meta, not Meta alone. The Thing-id race is the identity collision the seam can actually meet, and it answers `aggregate-refused`.

**Second process.** Measured on 2026-09-17 (Node 26.8.1, Apple M2), with a real second OS process holding a lock through raw `node:sqlite` (`test/support/sqlite-second-process.ts`) against a migrated temp file, and this process going through `SqliteSpaceRepository`:

| Second process holds | Operation here | Result | Wait |
| --- | --- | --- | --- |
| SHARED (`BEGIN` + read) | `commit` | `TRANSACTION_COMMIT_FAILED` ← `SqlConnectionError{transient}` | exhausted, 5.2–5.3s, at COMMIT |
| SHARED | `replaceAggregate` | same | exhausted |
| SHARED | `loadSpace` | succeeds | 2ms |
| RESERVED (`BEGIN IMMEDIATE`) | `commit`, `replaceAggregate` | `SqlConnectionError{transient}` | immediate, ≤5ms |
| RESERVED | `loadSpace` | succeeds | 1ms |
| EXCLUSIVE (`BEGIN EXCLUSIVE`) | `commit`, `loadSpace` | `SqlConnectionError{transient}` | exhausted, ~5.2s |
| EXCLUSIVE, released after 1s / 4s | `commit` | `committed` | 1.0s / 4.1s |

Held by the matrix: every row's outcome and whether its wait is immediate (<1s) or exhausted (≥5s, <7.5s), plus the 1s release. Seen in the probe and not asserted: the exact error codes (`TRANSACTION_COMMIT_FAILED`), the 5.2–5.3s figures, and the 4s release.

So the second process's *reader* is what starves a commit for the whole busy timeout — the in-process queue cannot help — while its uncommitted *writer* refuses this process's write at once. In every failing row the stored aggregate read back equal to what it was before, and the very next commit succeeded after release: no half-write, no stuck lock. Every failure carried a transient `SqlConnectionError` on its cause chain, and none was a typed conflict. The busy wait is synchronous `node:sqlite` work, so it blocks this process's event loop for its duration. The first-draft "~5.3s stall" of ticket 14 was two clients in one process; it now has a measured two-process counterpart, and the two agree on the exhausted figure only.

**HTTP.** Against an EXCLUSIVE holder, `POST /api/spaces` and `GET /api/spaces/:id` each answered 503 `persistence-unavailable` in the exhausted time, and `HttpSpaceBackend.commit` answered `retryable-failure`/`unavailable`, not `timeout`. The test holds the exhausted answer under 7.5s and at least 2s inside the backend's default 10s timeout. No mapping code was needed: the Fetch application answers every throw out of the repository as 503.

**Cost of serialising reads (ticket 16's follow-up).** Measured with a scratch probe, since deleted, so these numbers are not reproducible from the tree: 3,000 reads of one Space with 1,000 Things, the identical ORM query run directly or through a promise queue shaped like `#serialise`, at concurrency 1 and 8, three rounds. After a warm-up round both were ~430–450 reads/s at either concurrency. Concurrency gains nothing in one process because `node:sqlite` runs each step synchronously on the event loop, so the queue removes no parallelism there is. An earlier comparison through `repository.loadSpace` read 3–4× slower and was discarded: it also parsed every Thing, which the direct query did not.

**Operational write-up.** README "Local SQLite": one process per file, what a second process causes, rollback journal `delete` with `synchronous=FULL` (journal mode held by `writes the file in rollback-journal delete mode with synchronous FULL` in `sqlite-space-repository.test.ts`; `synchronous` is read from a connection opened as the driver opens one, so that test would not notice the driver starting to set it), quiesced copy or the backup API, and a stable absolute path in an application-owned local directory (missing and unwritable parents both fail at composition, `test/unit/prisma-sqlite-foundation.test.ts`; unset or blank `SQLITE_PATH` fails host composition, `test/integration/sqlite-http-runtime.test.ts`).

**CI.** The existing `sqlite` job already creates a temp directory, checks the emitted contract, migrates, runs the SQLite suite (now including the contention matrix), verifies the live file with `db verify`, and removes the directory; the `postgres` job is untouched. The matrix adds about 45s to that suite, most of it seven exhausted waits.

