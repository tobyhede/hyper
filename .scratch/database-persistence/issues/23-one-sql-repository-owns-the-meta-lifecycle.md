# 23 — One SQL repository owns the Meta lifecycle

**What to build:** `loadAggregate`, `initializeAggregate`, `loadMetaSpaceId`, `replaceAggregate` and `markExported` run on the one SQL Space repository for both databases, with PostgreSQL's complete sequence on both.

**Blocked by:** 22 — Tracer: one SQL repository reads both databases.

**Status:** ready-for-agent

**Why:** ADR 0095. The adapters drifted here: PostgreSQL retries `lockMetaIdentity` once after a replacement and re-locks every stored row and re-checks its revision inside `replaceAggregate`; SQLite does neither. The one repository takes PostgreSQL's steps everywhere, but one of them is untested and has to be settled first. When `lockMetaIdentity`'s self-update finds the row gone — a concurrent replacement deleted and rewrote it — it retries, and since `4ec1d1e7` ("Preserve replacement authorization across lock retry") it returns the Meta id it read **before** the replacement, not the one now stored. `replaceAggregate` then compares a stale caller's expected id against that old id, passes, and overwrites the concurrent replacement; a commit on the complete-aggregate path is judged against the old id. That may be intended, but no test fails if it is reversed, and a load-bearing step needs one (`docs/agents/workflow.md`) before it is carried to a second database.

- [ ] **First, on the existing PostgreSQL adapter:** a concurrency test races `replaceAggregate` against the Meta lock retry — a replacement landing between `lockMetaIdentity`'s read and its self-update — and asserts the intended answer for both a `replaceAggregate` authorized against the pre-replacement id and a complete-aggregate commit. Record on this ticket whether returning the pre-replacement id is correct. If it is not, fix it in the PostgreSQL adapter with that test before anything moves.
- [ ] The five lifecycle members are implemented once, over `SqlStore`, and pass the whole `spaceRepositoryContract` lifecycle group on both databases, including concurrent initialization and ADR 0094's truncation of broken stored state.
- [ ] The Meta-lock retry, as the test above settles it, and `replaceAggregate`'s row re-lock and revision re-check run on both databases; the race test runs against the one repository on PostgreSQL.
- [ ] Losing an initialization race is recognised through `SqlStore.isDuplicateKey(error, table)`. SQLite's matches the constraint the driver names in its message where 0.16.0 provides one, reaching PostgreSQL's table-and-constraint precision; if the message does not carry it, record that on this ticket and keep any-`23505` for SQLite.
- [ ] Every statement inside a transaction is awaited in sequence; no `Promise.all` inside `transaction`. This keeps Prisma Next 0.16.0's shared-connection interleaving defect unreachable (ADR 0095).
- [ ] `sqlite-contention.test.ts` still passes unchanged; in particular a second process still surfaces as a transient connection failure, not a conflict.

Out of scope: commit (24).
