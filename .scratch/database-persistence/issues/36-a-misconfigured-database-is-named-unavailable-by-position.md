# 36 — A misconfigured database is named unavailable by position, so start-up retries it forever

Status: needs-triage

Tags: Defect

Blocked by: None.

Surfaced by: a code review of ticket 31's implementation (`afd61774`) on branch `unavailable-arm` (2026-09-21). Not a regression: `#transaction`'s by-position rule is what ticket 31 decided, and the behaviour it names here predates it.

## The defect

`SqlSpaceRepository#transaction` (`src/persistence/sql-space-repository.ts`) names **every** failure raised before its callback runs `PersistenceUnavailableError`, by position, whatever the driver threw. Ticket 31's Answer chose that because the canonical outage never arrives as the driver's own type: `@prisma-next/driver-postgres`' `PostgresPoolDriverImpl.acquireClient` is a bare `this.pool.connect()`, and nothing on the acquire path calls `normalizePgError`, so a refused connection escapes as Node's `ECONNREFUSED` (`test/unit/postgres-unreachable.test.ts`).

The same position also holds failures no wait cures. Read in the driver, not reproduced against a server: a wrong password (SQLSTATE `28P01`, `invalid_password`), an authentication method the server rejects (`28000`), and a database that does not exist (`3D000`, `invalid_catalog_name`) are all raised by `pool.connect()` during the startup handshake, so they reach `#transaction` before its callback and are named unavailable. Each reader then answers for an outage:

- HTTP answers 503 `persistence-unavailable`, which tells a client the condition will pass.
- `retryMetaSpaceEstablishment` (`src/startup/database-startup.ts`) resets its confirming count on `unavailable` and keeps trying, backing off to once a minute, for the life of the process. A host deployed with a bad `DATABASE_URL` never gives up and never says the configuration is wrong — only that the database was unreachable, once a minute.

The accepted cost ticket 31 recorded ("a defect that fails before the callback — the driver's runtime failing to construct — is named unavailable too") names the runtime case; misconfiguration is a wider and more ordinary instance of the same cost.

## What distinguishes them

These errors are raw `pg` errors, not the driver's normalised ones, but they are not prose-only: `pg`'s `DatabaseError` carries the SQLSTATE on its own `code` field, the same field `normalizePgError` reads to build a `SqlQueryError`. So "failed before the callback" could be split by structured field rather than by message — a pre-callback failure carrying a SQLSTATE outside class `08` and outside `UNAVAILABLE_SQLSTATES` (`src/persistence/sql-store.ts`; `53300` and `57P03` are raised at connect too, and are genuinely unavailable) is the configuration or the server refusing this client, not an outage. Whether that is the right cut is the question this ticket asks; it is a sketch, not a decision.

## Acceptance (draft)

- [ ] Reproduce at least one case against a real PostgreSQL (a wrong password in `DATABASE_URL`) and record what reaches `#transaction`: its type, its `code`, and its `cause` chain.
- [ ] Decide which pre-callback failures are *not* unavailable, by a structured field, never message text; record the set and the reason, beside or inside `UNAVAILABLE_SQLSTATES`, so the two sets are read together.
- [ ] Decide what start-up does for them — give up on the first (a configuration error does not confirm itself by repeating) or count toward `CONFIRMING_FAILURES` like `unclassified` — and what HTTP answers.
- [ ] Tests at the seams ticket 31 used: `test/unit/postgres-unreachable.test.ts` (the refused connection stays unavailable), a unit test over the chosen predicate, and `test/unit/database-startup.test.ts` for the give-up.
- [ ] Keep SQLite's position case (`SQLite client is closed`, `sqlite-space-repository.test.ts`) unavailable, or say why it changes.
