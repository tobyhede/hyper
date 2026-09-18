# 22 — Tracer: one SQL repository reads both databases

**What to build:** The one SQL Space repository exists and serves `listSpaces` and `loadSpace` for PostgreSQL and SQLite, typed without a new assertion, beside the two adapters it will replace. PostgreSQL stores revisions as canonical decimal TEXT, as SQLite already does.

**Blocked by:** 21 — Record the one SQL Space repository.

**Status:** ready-for-agent

**Why:** ADR 0095. This is the slice that proves the typing and the `SqlStore` value against both generated contracts before the lifecycle and commit move onto it. A typing experiment (2026-09-17, `tsc` 7.0.2, since deleted) compiled a structural `Tables<…>` slice of `loadSpace` and a guarded revision update against both contracts with no assertion, and caught a misspelled column, a wrong revision type and a missing include field for both databases. Generic typing over Prisma Next's `Collection<C, 'Space', …>` did not compile.

- [ ] A `SqlStore` value per database with at most these members: `orm` (the handle for work outside a transaction), `tables(orm)`, `transaction`, `readDocument`, `isDuplicateKey(error, table)`, `serialise`, `close`. `listSpaces`, `loadSpace`, `loadMetaSpaceId`, `markExported` and the conflict re-read after a rollback run outside a transaction today — the re-read must, because the transaction has rolled back — so they take `tables(orm)` over that handle, inside `serialise`. They are not moved into `transaction`, which would add a `BEGIN`/`COMMIT` to every read and change SQLite's contention picture that ticket 18 measured. PostgreSQL's `serialise` runs the operation directly; SQLite's is the in-process queue now in `SqliteSpaceRepository.#serialise`.
- [ ] One `serialise` queue per file handle, not per repository object: two repositories over one SQLite handle share it, proven by a test that overlaps their operations. ADR 0095 says the queue orders every repository operation in the process; today `#serialise` is a field of each `SqliteSpaceRepository`, so two over one `SqliteDatabase` (as the HTTP runtime and `test/support/sqlite-harness.ts` each build) do not share it. (Architecture review, 2026-09-18.)
- [ ] The shared tables type is declared by the repository over the calls it makes. Property syntax only, no optional row fields, documents `unknown`. Both generated ORMs are assignable to it without a cast, and `eslint-suppressions.json` gains nothing.
- [ ] The include's refined collection and order item are opaque type parameters each database module derives without assertion — the experiment found `unknown` is not assignable to `OrderByItem` and inference yields `Collection<Contract, never, …>`.
- [ ] PostgreSQL's contract stores `revision` and `exported_revision` as TEXT. A planned migration under `migrations/app/` applies it (ADR 0054 keeps relational schema migrations); fixtures, seeds and integration helpers that write raw revisions roll forward in the same change.
- [ ] One shared revision codec owns the canonical decimal format and the 2^63−1 ceiling for both databases, on read and on write. Today SQLite's `toDatabaseRevision` checks only the digit format, so a 19-digit value above the ceiling is written; `CONTEXT.md`'s Revision entry already states the ceiling as the rule. PostgreSQL's `toDatabaseRevision` relabel and its `eslint-suppressions.json` entry are deleted. `http-protocol.ts`'s ceiling message stops naming PostgreSQL.
- [ ] The existing PostgreSQL adapter reads and writes revisions through that codec until ticket 24 deletes it.
- [ ] The contract's existing read cases (`listSpaces`, `loadSpace`, Thing order) run against the one repository on both databases.
- [ ] Because this ticket introduces the codec, it also moves revisions above `Number.MAX_SAFE_INTEGER` into `repository-contract.ts` (today PostgreSQL 1257, SQLite 212 and 305), and adds a case that a revision above 2^63−1 is refused rather than stored.
- [ ] `docs/agents/editing-and-persistence.md`'s Prisma Next `int8` workaround bullet is replaced by the TEXT revision rule.

Out of scope: moving the lifecycle (23) or commit (24); changing host composition (26).
