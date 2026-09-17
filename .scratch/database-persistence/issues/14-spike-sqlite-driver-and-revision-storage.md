# 14 — Spike SQLite driver and revision storage

**What to build:** A recorded go/no-go for an opt-in SQLite target: which Prisma stack Hyper uses, how revisions are stored so the full signed-int64 range round-trips, that a Space and its Things load in one statement, and how SQLite unique and BUSY errors actually classify. No production adapter, host, or CI job.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Why:** The August research is stale against today's `SpaceRepository`, and Prisma Next's repository has since been archived in favour of Prisma ORM v8. Choosing the stack and the revision column decides the schema 15–18 will commit to. An agent must not choose “move PostgreSQL to v8” as a side effect of adding SQLite.

Preferred exits, in order:

1. Stay on the pinned Prisma Next 0.16.0 PostgreSQL stack and add its SQLite facade beside it. Do not migrate PostgreSQL in this effort.
2. Store `revision` and `exported_revision` as canonical non-negative decimal TEXT if INTEGER cannot round-trip through the driver's Node `DatabaseSync` (which does not enable `readBigInts` in 0.16.0). Convert `bigint` ↔ string only at the SQLite adapter boundary. Equality in the optimistic `WHERE` is enough; Hyper does not arithmetic in SQL.
3. An upstream or upgraded driver that exposes lossless INTEGER bigint reads is acceptable if it is the same Prisma Next 0.16.0 line Hyper already pins, or a compatible patch that does not fork emitted artifacts.
4. A SQLite-only safe-integer ceiling, `Number` conversion, patching generated artifacts, or reaching into transitive packages is not an exit.

If the spike finds SQLite on 0.16.0 unusable, stop. Moving both targets to Prisma ORM v8 is a separate Postgres-first epic and **halts 15–18**; do not start them on a v8 schema.

- [x] The spike uses the exact Prisma package versions intended for implementation, re-queried at spike time rather than trusted from the August note.
- [x] A minimal Hyper-shaped SQLite contract (Space, Thing, singleton repository state, UUID text, JSON documents, timestamps) emits, migrates, closes, and reopens in a throwaway directory.
- [x] Revisions `0`, `Number.MAX_SAFE_INTEGER`, `Number.MAX_SAFE_INTEGER + 1`, and `2^63 - 1` round-trip through create, `where`, update, aggregate include, and `markExported`. The recorded decision names TEXT, INTEGER-with-bigint-reads, or “stop”.
- [x] The SQL generated for Space+Things `include` is one statement with deterministic Thing order. If it is not, the spike records what SQLite would need instead of reintroducing a revision-before/after retry.
- [ ] Two connections exercise same-Space optimistic writes, different-Space writes, identity collisions, truncate+replace, `markExported` racing a commit, and COMMIT contention. Each failure is classified as conflict, identity rejection, or exhausted BUSY/LOCKED — not guessed from PostgreSQL SQLSTATE metadata. **Partly met (corrected on review):** identity rejection and BUSY/LOCKED were produced under contention; a zero-row optimistic *conflict* was not — every same-Space race ended in BUSY on both sides, and "conflict = zero-row match" rests only on the sequential one-connection test in §3. "Truncate+replace" was not exercised either (§5, Scenario 4). Both are carried by ticket 18.
- [x] Foreign-key enablement, `ON DELETE CASCADE`, and the Thing-by-Space index are verified on the migrated file.
- [x] The decision is written on this ticket: Prisma stack, revision storage, UUID allocation (prefer in-process `newId`, already the aggregate-directory rule), journal (prefer default rollback), and whether 15 may start. 15–18 stay untouched if the answer is no.

## Answer

**Decision: GO. Preferred exit #2 (canonical decimal TEXT revisions on the pinned Prisma Next 0.16.0 SQLite facade). Ticket 15 may start.**

All spike code was throwaway, under `.scratch/database-persistence/spike-sqlite/`, deleted after review under `docs/agents/build-tooling.md`'s spike-harness rule (see the spike file index below). It had its own `package.json`, installed standalone via `npm install` — deliberately outside the pnpm workspace glob (`packages/*`) and outside every root `include`/ignore list, so it never touched `pnpm-lock.yaml`, `verify`, prettier, eslint or oxlint. Every command below was actually run in that directory on 2026-09-16; nothing here is asserted without having been executed.

### 1. Exact package versions, re-queried (not trusted from August)

```
$ node --version
v26.8.1
$ npm view @prisma-next/sqlite version
0.16.0
$ npm view @prisma-next/sqlite dist-tags --json
{ "latest": "0.16.0", "dev": "0.16.0-dev.35" }
```

`latest` is still exactly `0.16.0` — the same line Hyper already pins for PostgreSQL (`prisma-next`, `@prisma-next/postgres`, and the four facade-typing devDependencies are all `0.16.0` in the root `package.json`). No version drift since August. `npm install` in the spike directory did print the upstream deprecation notice on every `@prisma-next/*` package (`"The @prisma-next scope is retired. Prisma Next continues as Prisma ORM v8..."`), confirming the ticket's premise that the line is archived upstream — but the exact pinned `0.16.0` tag remains resolvable and installable unchanged, so exit #1 (stay on the pinned line, do not move to v8) is available and is what this spike used throughout.

### 2. Minimal Hyper-shaped contract: emit, migrate, close, reopen

Two spike contracts mirror `src/prisma/contract.prisma`'s three models (`Space`, `RepositoryState`, `Thing`) exactly — same fields, same `@map`s, same FK/index — differing only in the `revision`/`exported_revision` type:

- `contract-text.prisma` — `revision String`, `exportedRevision String?` (spike files: `contract-text.prisma`, `prisma-next.config.text.ts`)
- `contract-bigint.prisma` — `revision BigInt`, `exportedRevision BigInt?` (spike files: `contract-bigint.prisma`, `prisma-next.config.bigint.ts`)

For each: `prisma-next contract emit --config <config>` → `migration plan --config <config> --name init` → `migrate --config <config>` against a fresh file under `.spike-db/`. Both emitted cleanly and migrated in one operation set (`"summary": "Applied 1 migration(s) (5 operation(s))"`). Ids use plain `String` (SQLite has no native UUID type or codec — confirmed by reading `@prisma-next/target-sqlite`'s codec registry directly, which ships only `text`/`integer`/`real`/`blob`/`datetime`/`json`/`bigint`); UUID text is validated at the application boundary, as it already is for PostgreSQL.

Migrated DDL (identical shape for both contracts except the `revision`/`exported_revision` column type):

```sql
CREATE TABLE "repository_state" (
  "meta_space_id" TEXT NOT NULL,
  "singleton_id" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("singleton_id"),
  FOREIGN KEY ("meta_space_id") REFERENCES "spaces" ("id") ON DELETE RESTRICT
)
CREATE TABLE "spaces" (
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "document" TEXT NOT NULL,
  "exported_revision" TEXT,      -- INTEGER in the bigint contract
  "id" TEXT NOT NULL,
  "revision" TEXT NOT NULL,      -- INTEGER in the bigint contract
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("id")
)
CREATE TABLE "things" (
  "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
  "document" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "space_id" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("space_id") REFERENCES "spaces" ("id") ON DELETE CASCADE
)
CREATE INDEX "repository_state_meta_space_id_idx" ON "repository_state" ("meta_space_id")
CREATE INDEX "things_space_id_idx" ON "things" ("space_id")
```

Close/reopen durability was proven in `02-revision-text.ts`: write, `await db.close()`, open a **new** `sqlite({ contractJson, path })` client against the same file, and read the same row back — `revision`/`exportedRevision` both survived exactly (`close/reopen: revision and exportedRevision survived -> 9223372036854775807 0`).

`id String @id` has no database-side default (no SQLite equivalent of PostgreSQL's `gen_random_uuid()` — confirmed empirically: `create({ document, revision, exportedRevision })` without `id` throws `NOT NULL constraint failed: spaces.id`, spike file `05-uuid-default-check.ts`). This supports process-side `newId()` allocation for SQLite, matching the aggregate-directory rule already in force (ADR 0016) and the recommendation in `sqlite-target-research.md`.

### 3. Revision round trips — the actual bigint decision

**TEXT (`02-revision-text.ts`, contract A) — full pass, no caveats.** `create`, `where`, `update`, the Space+Things `include`, and a `markExported`-style update (`.where({ id }).update({ exportedRevision })`) all round-tripped `0`, `Number.MAX_SAFE_INTEGER`, `Number.MAX_SAFE_INTEGER + 1`, and `2^63 - 1` exactly, verified both as the returned string and as `BigInt(value)` equality against the expected bigint. Optimistic `WHERE` equality on the decimal string worked correctly both ways: a matching revision matched exactly one row, a mismatched one matched zero. Actual output:

```
create: revision round-trips at 0 -> 0
where/update round trip OK at 0: stored "0"
where/update round trip OK at Number.MAX_SAFE_INTEGER: stored "9007199254740991"
where/update round trip OK at Number.MAX_SAFE_INTEGER + 1: stored "9007199254740992"
where/update round trip OK at 2^63 - 1: stored "9223372036854775807"
optimistic WHERE mismatch correctly matched 0 rows (classified: conflict)
optimistic WHERE match correctly matched 1 row, unchanged revision 2^63 - 1
markExported-style update round-trips exportedRevision -> 0
close/reopen: revision and exportedRevision survived -> 9223372036854775807 0
```

**BigInt/INTEGER (`03-revision-bigint.ts` + `03b-plain-read-check.ts`, contract B) — confirms the predicted failure directly, from the installed 0.16.0 source, not trusted from the research note.** Reading `@prisma-next/driver-sqlite/src/sqlite-driver.ts` as actually installed: `new DatabaseSync(path)` is called with no options, so `readBigInts` is `false` (Node's default). `0` and `Number.MAX_SAFE_INTEGER` round-trip fine (write and read both succeed, typed `bigint` throughout via the `sqlite/bigint@1` codec). At `Number.MAX_SAFE_INTEGER + 1` and `2^63 - 1`, the write itself throws:

```
--- Number.MAX_SAFE_INTEGER + 1 (9007199254740992) ---
  update (write) THREW: RangeError: Value is too large to be represented as a JavaScript number: 9007199254740992
--- 2^63 - 1 (9223372036854775807) ---
  update (write) THREW: RangeError: Value is too large to be represented as a JavaScript number: 9223372036854775807
```

This throws on "write" because the ORM's `.update()` call reads the row back via `RETURNING` in the same statement; `03b` isolates this to a plain, unrelated `.where().first()` read against a row seeded directly via raw SQL, confirming it is the *read* path, not something specific to `RETURNING`:

```
plain where-read THREW: RangeError ERR_OUT_OF_RANGE Value is too large to be represented as a JavaScript number: 9223372036854775807
```

Reading `node:sqlite`'s own behaviour directly (raw `DatabaseSync`, no Prisma involved) confirms the exact error shape: `name: RangeError`, `code: 'ERR_OUT_OF_RANGE'`, `instanceof RangeError: true`. Critically, `@prisma-next/driver-sqlite/src/normalize-error.ts`'s `normalizeSqliteError` only re-classifies an error when `error.code === 'ERR_SQLITE_ERROR'` (SQLite's own C-level errors) or the message matches `'database is locked'`/`'unable to open database'`. `ERR_OUT_OF_RANGE` matches neither, so this `RangeError` is **not** normalized into `SqlQueryError`/`SqlConnectionError` — it reaches application code as a bare, unclassified Node `RangeError`. There is no retry, conflict, or transient signal to hang a recovery decision on.

**Decision: TEXT.** Per the ticket's hard constraints, exit #3 (an upstream/upgraded driver with lossless bigint reads, same 0.16.0 line) does not exist — the installed 0.16.0 driver source is unchanged from what the research note described, and there is no newer `0.16.0`-line release to move to. Exit #4 (safe-integer ceiling, `Number` conversion, patched artifacts, reaching into transitive packages) is explicitly forbidden. Exit #2 (canonical decimal TEXT, `bigint` ↔ string conversion only at the SQLite repository boundary, equality-only `WHERE`) is proven above to round-trip the full signed-int64 range losslessly through every operation the ticket asked for. This mirrors the existing `toDatabaseRevision`/`toRevision` isolation pattern already used for PostgreSQL's own `int8`-typed-as-`number` workaround in `postgres-space-repository.ts` — a SQLite repository would gain a symmetrical `toDatabaseRevision`/`toRevision` pair that stringifies/parses instead of relabelling.

### 4. Space+Things aggregate `include` — one statement, deterministic order

Captured via a `beforeExecute` middleware hook (`SqlMiddleware`, from `@prisma-next/sql-runtime`) around the exact call shape used in `loadStoredSpace`/`loadEverySpace` (`.where({ id }).include('things', (t) => t.select('id','document').orderBy((t) => t.id.asc())).first()`). **Exactly one SQL statement was emitted**, using a correlated subquery with `json_group_array`/`json_object`, ordered by `things.id ASC` inside the subquery — the SQLite target's JSON-aggregate capability (`jsonAgg: true`) makes the same one-statement `include` shape PostgreSQL already uses work unchanged on SQLite:

```sql
SELECT "spaces"."created_at" AS "created_at", "spaces"."document" AS "document",
       "spaces"."exported_revision" AS "exported_revision", "spaces"."id" AS "id",
       "spaces"."revision" AS "revision", "spaces"."updated_at" AS "updated_at",
       (SELECT coalesce(json_group_array(json_object('id', "things__rows"."id", 'document', "things__rows"."document")
               ORDER BY "things__rows"."things__order_0" ASC), '[]') AS "things"
        FROM (SELECT "things"."id" AS "id", "things"."document" AS "document", "things"."id" AS "things__order_0"
              FROM "things" WHERE "things"."space_id" = "spaces"."id" ORDER BY "things"."id" ASC) AS "things__rows") AS "things"
FROM "spaces" WHERE "spaces"."id" = ? LIMIT 1
```

Two Things inserted in reverse-id order (`B` then `A`) came back in the query result as `[A, B]` — deterministic ascending order, matching `loadStoredSpace`'s `orderBy((thing) => thing.id.asc())`. No revision-before/after retry is needed; the existing PostgreSQL repository shape (one `include`, no explicit read transaction) transfers unchanged.

### 5. Two-connection contention matrix — actual classifications, not guessed

All six scenarios in `04-contention.ts` (plus three isolating follow-ups, `04c`/`04d`/`04e`, written after Scenario 1's first run produced a result that needed explaining before trusting it) ran against the TEXT contract. Classification used the driver's own typed errors (`SqlConnectionError.is`, `SqlQueryError.is`, `isUniqueConstraintViolation`, all from `@prisma-next/sql-errors`) — never PostgreSQL SQLSTATE guesses.

**Read the labels below with two corrections (review, 2026-09-16).** "Two independent connections" means two `sqlite()` clients **in one Node process**; no scenario used a second process. And the script printed "exhausted BUSY/LOCKED" for *every* `SqlConnectionError{transient:true}`, whatever its latency. Only the ~5.3s failures waited out the 5000ms `busy_timeout`; the 2–3ms ones (Scenario 4's commit, `04e`'s loser) are an **immediate** BUSY/LOCKED — SQLite returned the error without waiting. The two share an error type and are told apart only by time, so this write-up calls them *exhausted* and *immediate* from here on.

```
Scenario 1 (same-Space, predicate-guarded .where({id,revision}).update(), two independent connections):
  A: SqlConnectionError transient=true -> exhausted BUSY/LOCKED, 5389ms
  B: SqlConnectionError transient=true -> exhausted BUSY/LOCKED, 5389ms
  final revision: 1 (unchanged — neither write landed)

Scenario 2 (different-Space writes, two independent connections):
  A (Space 1): SqlConnectionError transient=true -> exhausted BUSY/LOCKED, 5366ms
  B (Space 2): SqlConnectionError transient=true -> exhausted BUSY/LOCKED, 5366ms

Scenario 3 (identity collision, two independent connections create() the same id):
  A: created, 4ms
  B: SqlQueryError sqlState=23505 constraint=spaces.id table=undefined -> identity rejection, 4ms

Scenario 4 (labelled "truncate+replace racing a commit" — see the correction below the block; two independent connections):
  truncate: succeeded, 4ms
  concurrent commit: SqlConnectionError transient=true -> exhausted BUSY/LOCKED, 3ms
  Spaces remaining after the race: 0 (truncate won)

Scenario 5 (markExported racing a commit, same row, disjoint columns, no revision guard, two independent connections):
  markExported: SqlConnectionError transient=true -> exhausted BUSY/LOCKED, 5384ms
  concurrent commit: SqlConnectionError transient=true -> exhausted BUSY/LOCKED, 5383ms
  final row: revision=1 exportedRevision=null (neither landed)

Scenario 6 (COMMIT contention, raw node:sqlite connections, forces the driver's hard-coded 5000ms busy_timeout to actually expire):
  waiter blocked for 5364ms then threw: code=ERR_SQLITE_ERROR errcode=5 message=database is locked
  classification: SQLite BUSY, exhausted after the full busy_timeout window -> exhausted BUSY/LOCKED
```

**Scenario 4 does not test truncate-and-replace (corrected on review).** Its "truncate" was three separate auto-commit statements — `Thing.deleteAll()`, `Space.deleteAll()`, then deleting the `RepositoryState` row — with no enclosing transaction and no replacement insert. "Truncate won" says only that those deletes ran before a racing update; it says nothing about how a real `replaceAggregate` transaction behaves against a commit. The racing commit's 3ms failure is an *immediate* BUSY, not an exhausted one.

**Finding beyond the checklist, load-bearing for how 15/16 should compose the repository.** Scenarios 1, 2 and 5 were surprising — *both* sides failed after the full ~5.3s busy window, not one winner and one loser, and this happened even for Scenario 2's genuinely disjoint rows. `04b-predicate-update-sql.ts` captured part of why: the ORM's `.update()` (both the predicate-guarded form and the plain PK-only form the real repository actually uses in `writeSpaceDocumentUnderLock`) always issues a `SELECT` probe before the `UPDATE`, not just when there's a non-PK predicate. So each side reads before it writes, and SQLite's rollback-journal locking is **file-level, not row-level**, which is why disjoint Spaces were no different (Scenario 2 behaved like Scenario 1).

*Lock model, corrected on review.* An earlier draft said both sides "are blocked waiting for the other's SHARED lock to release before either can acquire RESERVED". That is not how SQLite locks work: RESERVED can be taken while other connections hold SHARED; only the PENDING→EXCLUSIVE step a writer needs to commit waits for readers to leave. And a connection holding SHARED that asks for RESERVED while another already holds RESERVED/PENDING is refused, and SQLite's documentation for `sqlite3_busy_handler` says it returns BUSY rather than invoke the busy handler where waiting could deadlock — which fits the immediate (2–3ms) failures. The spike did not capture which lock each side of the ~5.3s failures waited on. One thing it did not rule out is specific to the setup: both clients lived in one Node process, and `node:sqlite` waits synchronously, so a busy wait blocks the event loop and the rival cannot release its lock until the wait ends. That means these numbers do not transfer to two *processes* without being measured there. The risk `sqlite-target-research.md`'s concern #2 named for the driver's hard-coded plain `BEGIN` (vs. `BEGIN IMMEDIATE`) is real; the precise lock sequence stays unverified.

Two follow-up isolations settle what this means operationally:

- `04c-isolate-race-then-recover.ts`: after a mutual-BUSY failure, the row is left exactly as it was (no half-write), and **both connections recover cleanly** on the very next sequential call — this is a transient contention failure, not a stuck lock or corrupted connection state.
- `04e-single-client-race.ts`: racing two overlapping plain `.update()` calls — no explicit `transaction()` — through **one shared client** did not wait. One side won in 2ms and the loser failed in 2ms as the same `SqlConnectionError transient=true` (an *immediate* BUSY). **This does not show that one client avoids the long lock (corrected on review).** In the installed driver (`@prisma-next/driver-sqlite/src/sqlite-driver.ts`), `acquireConnection()` opens a new `DatabaseSync(path)` every time, and `withTransaction` (`@prisma-next/sql-runtime/src/sql-runtime.ts`) acquires one for every `transaction()` and issues its own `BEGIN`. So two overlapping transactions through one client are two SQLite connections on one file, exactly like two clients. The repository's transactions read then write (`lockMetaIdentity`'s read and dummy update, then more reads or writes), which `04e` never raced:

  ```
  elapsed: 2ms
  [0] fulfilled: matched=true document={"kind":"meta","by":"first"}
  [1] SqlConnectionError kind=sql_connection transient=true message=database is locked
  ```

- **Added on review — overlapping repository transactions through one client (method and numbers).** Against the committed ticket-15 `SqliteSpaceRepository` (commit `3c620489`, before any in-process serialisation), with one `createSqliteDatabase` client on a migrated temp file and an initialized one-Space aggregate, `Promise.allSettled([repository.loadAggregate(), repository.loadAggregate()])` answered one `loaded` and one `SqlConnectionError: database is locked` in 3ms (two runs, 3ms both times). On an uninitialized file, two overlapping `initializeAggregate` calls with the same proposal answered `initialized` and the same error in 8–9ms (two runs) — not `existing`. A second harness, fresh per case, reproduced `loadAggregate`×2 (2ms, one BUSY), `loadAggregate`×3 (2ms, two BUSY) and an `initializeAggregate` of an existing aggregate beside `loadAggregate` (2ms, one BUSY). `loadAggregate` beside a plain `loadSpace` or `listSpaces`, in either order, answered both (1–2ms). No case waited out the busy timeout. The regression tests are the two "overlapping" cases in `test/integration/sqlite-space-repository.test.ts`.

**Implication for tickets 15/16 (corrected on review).** One runtime per process is still right, but it is **not** enough on its own: a single client opens one connection per transaction, so overlapping transactions in one process contend exactly as two clients do. Measured through the one client, the loser failed immediately rather than stalling; two clients in one process stalled ~5.3s (Scenarios 1, 2, 5). Neither shape is acceptable for an in-process overlap, which is why 16 and 18 require in-process serialisation of repository transactions. Two claims an earlier draft made were not measured and are withdrawn: that "the existing repository-failure → HTTP 503 retry path already handles" a same-client loser (no request went through the HTTP host), and that the multi-second shape is a risk "only" for a second independent connection. A second *process* on the same live file (ticket 17's CLI) was never measured at all.

### 6. Foreign keys, cascade, index — verified directly against the migrated file

Using raw `node:sqlite` against `.spike-db/text-revision.db` after migration (not assumed from the driver's source):

```
FK CHECK: dangling insert correctly rejected — FOREIGN KEY constraint failed errcode=787
CASCADE CHECK: things remaining after deleting owning space = 0 (expect 0)
INDEX CHECK: { name: 'things_space_id_idx', sql: 'CREATE INDEX "things_space_id_idx" ON "things" ("space_id")' }
```

`errcode=787` decodes to `SQLITE_CONSTRAINT_FOREIGNKEY` (19 + 3×256), which `normalize-error.ts` maps to `sqlState: '23503'` — matching PostgreSQL's `foreign_key_violation` class at the outcome level, per the ticket's "classify at the outcome level" guidance. `PRAGMA foreign_keys` reads `1` on every connection opened this way (Node's `DatabaseSync` default, and the Prisma driver additionally runs `PRAGMA foreign_keys = ON` explicitly on every connection it opens — confirmed by reading `sqlite-driver.ts`'s `openConnection`).

### 7. Journal mode

```
$ node -e "... PRAGMA journal_mode ..."
journal_mode: 'delete'
synchronous: 2   (FULL)
```

The migrated file uses SQLite's default rollback journal (`delete` mode) and `synchronous=FULL` — nothing in the CLI/migration/runtime path changes either, so "default rollback" is what a SQLite target gets without extra configuration, matching the ticket's preference.

### Decision summary

| Question | Answer | Evidence |
|---|---|---|
| Prisma stack | Stay on pinned Prisma Next **0.16.0** line; add `@prisma-next/sqlite@0.16.0` beside the pinned `@prisma-next/postgres@0.16.0`. Do **not** move to Prisma ORM v8. | §1 — `npm view` reconfirms `latest` is unchanged at `0.16.0`; PostgreSQL contract/config untouched by this spike. |
| Revision storage | **Canonical non-negative decimal TEXT**, `bigint` ↔ string only at the SQLite repository boundary, equality-only optimistic `WHERE`. | §3 — TEXT round-trips all four boundary values through create/where/update/include/markExported; BigInt/INTEGER throws an unclassified `RangeError{code:ERR_OUT_OF_RANGE}` above `Number.MAX_SAFE_INTEGER`, on both write (via RETURNING) and plain read. |
| UUID allocation | Process-side `newId()`, same as the aggregate-directory rule (ADR 0016) — SQLite has no DB-side UUID generator/default to fall back on. | §2 — `create()` without `id` fails `NOT NULL constraint failed`; no UUID codec exists in `@prisma-next/target-sqlite`. |
| Journal | Default rollback journal (`delete` mode), unmodified `synchronous=FULL`. | §7. |
| Aggregate read shape | Unchanged — one `include` statement, deterministic Thing order, no read-transaction/retry needed. | §4. |
| Contention classification | Identity rejection = `SqlQueryError` with `sqlState 23505` (produced under contention, Scenario 3). BUSY/LOCKED = `SqlConnectionError{transient:true}` / raw `SQLITE_BUSY` (errcode 5), seen in two shapes that share that type: *exhausted* after the driver's hard-coded 5000ms (Scenarios 1, 2, 5, 6; ~5.3s) and *immediate* (Scenario 4, `04e`, and the review's one-client repository races; 2–9ms). Conflict = zero-row match on a guarded `.update()` was shown **only sequentially on one connection** (§3); no contended race produced it. | §3, §5. |
| FK/cascade/index | Enabled by default on every connection the driver opens; `ON DELETE CASCADE` and the `things_space_id_idx` index both hold on the migrated file. | §6. |
| **May ticket 15 start?** | **Yes.** | Stack and revision storage are evidenced above. The contention item is only partly met (see checklist), and what is missing (contended conflict, real truncate-and-replace, second process) is ticket 18's, not a blocker to 15. |

### Constraints honoured / not satisfiable

- Stayed on pinned Prisma Next 0.16.0 for the whole spike; PostgreSQL's `contract.prisma`, `prisma-next.config.ts` and `src/prisma/db.ts` were read for reference only, never edited.
- No safe-integer ceiling, no `Number` conversion, no patched generated artifacts, no reach-ins to transitive packages — the BigInt contract's failure is reported as-is, not worked around.
- No production dependency was added. The one new dependency (`@prisma-next/sqlite@0.16.0`) lived only in `.scratch/database-persistence/spike-sqlite/package.json` (since deleted), installed standalone via `npm install` (not `pnpm`), so `pnpm-lock.yaml` and the workspace are untouched — confirmed via `git status` showing no change to any tracked lockfile.
- One thing the ticket's checklist did not ask for and this spike did not attempt: resolving the BUSY/LOCKED contention itself (e.g., in-process serialisation or forcing `BEGIN IMMEDIATE`). That is a repository-composition concern for ticket 16/18, not a blocker to starting them — recorded above as an implication, not solved here.

### Spike file index (`.scratch/database-persistence/spike-sqlite/`)

**Deleted after review (2026-09-16).** The files were never git-tracked (the root `.gitignore` ignores everything under `.scratch/` except `.md` files), and `docs/agents/build-tooling.md` says "Delete a spike harness when you write it up; ignoring it is not enough". An earlier draft kept them on disk anyway so the decision stayed checkable. That broke the rule, and nothing in tickets 15–18 depended on the files, so they are gone. What they proved is the evidence in this ticket, in words. The list below records what existed so the numbers above can be traced to a method; re-running any of it means rewriting it.

- `package.json` — standalone, non-workspace; `@prisma-next/sqlite@0.16.0` dependency, `tsx` devDependency.
- `contract-text.prisma` / `prisma-next.config.text.ts` — TEXT-revision contract and config.
- `contract-bigint.prisma` / `prisma-next.config.bigint.ts` — BigInt/INTEGER-revision contract and config.
- `02-revision-text.ts` — full round trip + include SQL capture + close/reopen, TEXT contract.
- `03-revision-bigint.ts`, `03b-plain-read-check.ts` — BigInt/INTEGER failure reproduction.
- `04-contention.ts` — the six-scenario contention matrix.
- `04b-predicate-update-sql.ts` — captures the SELECT-then-UPDATE shape behind Scenario 1/2/5.
- `04c-isolate-race-then-recover.ts`, `04d-pk-only-update-race.ts`, `04e-single-client-race.ts` — isolate and explain the mutual-BUSY result.
- `05-uuid-default-check.ts` — confirms no DB-side UUID default.
- `.spike-db/`, `migrations-text/`, `migrations-bigint/`, `contract-*.json`, `contract-*.d.ts` — generated/throwaway; not hand-authored evidence.

## Comments

**15 approved, 18 rewritten (2026-09-16).** The GO stands. Ticket 18 as first written required two independent runtimes against one file to both succeed on different Spaces; the spike showed that shape (two clients in one process) is the ~5.3s mutual-BUSY stall, not PostgreSQL row locking. 18 now requires one process to own the file, in-process writer serialisation so overlapping commits do not each open a deferred transaction, and exhausted BUSY only when a second process is on the same live file. 15–17 carry that composition constraint.

**Review corrections (2026-09-16).** Seven findings were checked against the installed driver and the committed ticket-15 code, and corrected above, not appended as history. (1) One client does not share one connection: every transaction opens its own `DatabaseSync` handle, so one runtime per process does not by itself prevent contention between overlapping transactions. Measured red against `3c620489`: overlapping `loadAggregate`s and overlapping first `initializeAggregate`s through one client fail with an **immediate** `database is locked` (2–9ms), not a ~5s stall. (2) The "503 retry path handles it without new code" claim was never exercised and is withdrawn. (3) Fast failures are no longer labelled *exhausted*. (4) Scenario 4 was three auto-commit deletes, not truncate-and-replace. (5) Contended *conflict* was never produced, so its checklist box is unticked. (6) The SHARED/RESERVED lock explanation was wrong and is replaced. (7) The spike harness is deleted, per the build-tooling rule.
