# 37 — A failed contract-marker read is cached for the life of the runtime

Status: resolved

Tags: Defect

Blocked by: None.

Surfaced by: ticket 31's implementation, recorded in its `## Answer` under "Found on the way, not fixed here", which asked for its own ticket; filed from a code review of that implementation (2026-09-21).

## The problem

Before its first statement, a `@prisma-next` SQL runtime reads the database's contract marker — the row migrations write naming the schema the database holds — and memoises the read so later statements skip it. It memoises a **failed** read too. So when the database is unreachable at the first statement, that runtime answers every later read with the same cached failure, without contacting the database, after the database is back. Only a new runtime — a host restart — recovers.

The cached failure is `CliStructuredError` `3006`, "Database error while reading contract marker", with no `cause` and the driver's reason only in its `why` prose. Nothing on its chain is a `SqlConnectionError` or a SQLSTATE, so the store's `isUnavailable` cannot recognise it: HTTP answers 500 rather than 503, and start-up counts it as unclassified, so `retryMetaSpaceEstablishment` gives up after two attempts instead of waiting out the outage tickets 31 and 38 built it to wait out.

## Reproduced (2026-09-21, triage)

Against `@prisma-next/sql-runtime` 0.16.0, no database needed: a `SqlSpaceRepository` over `postgresSqlStore`, its runtime built with the default options and pointed at a loopback port with nothing listening.

1. `listSpaces` rejects with `CliStructuredError` `3006`, no `cause`.
2. A TCP listener is opened on that port, counting connections.
3. `listSpaces` and `loadMetaSpaceId` each reject with **the identical error object** (`===`) as step 1, and make **zero** connections to the listener.
4. `loadAggregate` does connect — a transaction acquires its connection before it reaches the memoised check — so against a recovered server it would get past the connection and then meet the same cached `3006`. That last step is inferred, not observed.

The code path, confirmed in the installed runtime and on upstream `main` (`packages/2-sql/5-runtime/src/sql-runtime.ts`, pushed 2026-08-25): the constructor sets `verifyMarkerPromise` to `null` under the default `verifyMarker: 'onFirstUse'`; `streamRows` assigns it once and awaits it; nothing resets it on rejection. Upstream's own comment says the memoisation exists so concurrent first queries share one read — caching a failure is a side effect, not the intent.

## Decision

Construct both databases' runtimes with `verifyMarker: false`.

`VerifyMarkerOption` is `'onFirstUse' | false`. In 0.16.0 the check never refuses anything: a missing or mismatched marker only logs `CONTRACT.MARKER_MISSING` / `CONTRACT.MARKER_MISMATCH`. So `false` gives up one warning log on schema drift, which nothing reads, and removes the only way this cached failure arises. Schema drift is the migrations' concern (`pnpm db:migrate`), not the first query's.

Rejected: a `pnpm patch` on `@prisma-next/sql-runtime` resetting the promise on rejection (a second vendored patch to carry across upgrades, to preserve a warning log); rebuilding the store's runtime after a marker failure (machinery for the same warning).

Upstream: the defect is present on `prisma/prisma-next` `main`; there is no later release (0.16.0 is `latest`) and no public place to report it — the repository has issues disabled and its pull requests are not public. Nothing here depends on upstream fixing it.

## Agent Brief

**Category:** bug
**Summary:** Open both SQL runtimes with the contract-marker check off, so a database outage at the first statement no longer outlives the outage.

**Current behavior:**
`createPostgresDatabase` and the SQLite runtime's options pass no `verifyMarker`, so each runtime runs the default `'onFirstUse'` check. If the database is unreachable at the runtime's first statement, every later non-transactional read on that runtime rejects with the same cached `CliStructuredError` `3006`, unclassified, without reaching the database — for the life of the runtime.

**Desired behavior:**
Both the PostgreSQL and the SQLite runtime this repository composes are constructed with `verifyMarker: false`, each with a short comment stating why: the check only logs on drift, and a failed read is memoised for the life of the runtime. After an outage at the first statement, the next statement on the same repository reaches the database. A refused connection on a direct read is then the driver's own `SqlConnectionError`, which the store already classifies unavailable — so the first read during a start-up outage answers 503 and start-up keeps waiting, rather than 500 and giving up.

**Key interfaces:**
- `createPostgresDatabase()` — the options it passes to `postgres<Contract>` gain `verifyMarker: false`.
- The SQLite runtime's options (what `sqlite<Contract>` is given) gain `verifyMarker: false`.
- `SqlSpaceRepository` / `postgresSqlStore` / `isUnavailable` — unchanged; the point is that they now see the connection failure rather than `3006`.

**Acceptance criteria:**
- [x] A test that fails before the change and passes after: a repository over a runtime built the way `createPostgresDatabase` builds it (its options, a loopback URL with nothing listening), one `listSpaces` that fails, then a listener opened on that port, then a second `listSpaces` that reaches the listener (connection count > 0) rather than rejecting with the first call's error. No database required.
- [x] Tests that turned the marker off to observe the connection rather than this defect no longer need a separately-configured runtime for that reason; their comments no longer cite ticket 37 as a live defect.
- [x] `test:integration:postgres`'s misconfiguration cases that assert the `'onFirstUse'` shape (`CliStructuredError` `3006` on a direct read) no longer describe the runtime production opens with. Either drop the `'onFirstUse'` arms or keep them explicitly labelled as the library default this repository does not use — the start-up give-up case there (wrong password, unclassified, two attempts) must still pass with production's options.
- [x] Every document that names ticket 37 as open — the ADR 0095 entry in `AGENTS.md`/`CLAUDE.md`, and tickets 31 and 38 — says it is resolved and how.
- [x] `pnpm verify` green (see `## Answer`). `pnpm test:integration:postgres` and `pnpm test:integration:sqlite` were **not** run by this agent — no database was available and starting one was out of scope for this task — so this half is left for CI, which runs both.

**Out of scope:**
- Patching, forking or reporting to `@prisma-next`.
- Any replacement for the marker check (a start-up drift check, a migration assertion).
- Classifying `3006` — once the check is off it cannot arise.
- Ticket 35's and 36's concerns.

## Answer

**Built (branch `marker-cache`).** Both SQL runtimes are now constructed with `verifyMarker: false`:

- `src/prisma/db.ts` gained an exported `postgresOptionsFor(databaseUrl)`, factored out of `createPostgresDatabase` so a caller needing the same runtime against a URL of its own builds it identically rather than restating the option and why. It sets `verifyMarker: false` on both the URL and no-URL branches, with a comment stating the check only logs on drift in the installed 0.16.0 and a failed read is memoised for the runtime's life otherwise. `createPostgresDatabase` now reads `postgres<Contract>(postgresOptionsFor(configuredDatabaseUrl()))`.
- `src/sqlite/db.ts`'s private `optionsFor(path)` gained the same `verifyMarker: false` on both branches, with the same comment.

**Test-first.** `test/unit/postgres-unreachable.test.ts` gained a new describe block, "SqlSpaceRepository (PostgreSQL) after a first read meets an outage": it finds a free loopback port (bind to port 0, read it, close), builds a repository over a runtime through `postgresOptionsFor` pointed at that port with nothing listening, confirms one `listSpaces` fails, opens a counting TCP listener on the same port, and asserts a second `listSpaces` fails too but (a) is not the identical error object as the first and (b) the listener saw at least one connection. Run against `postgresOptionsFor` temporarily restored to its pre-fix shape (no `verifyMarker`), it failed exactly as triaged: `expected CliStructuredError … not to be CliStructuredError …` (the identical cached object), with the listener never reached. Restoring `verifyMarker: false` turned it green; the full file (15 tests) passes.

**Test cleanup, per the acceptance criteria:**

- `test/unit/postgres-unreachable.test.ts`: the separate `unverifiedDatabase`/`unverified` repository that existed only to dodge this defect on direct reads is gone — one `database`/`repository` pair, built through `postgresOptionsFor`, now serves every case (transactional and direct alike), since production's own options are no longer marker-cached. `refusedBy` and the two inline stand-in-server runtimes also build through `postgresOptionsFor`. No comment in the file cites ticket 37 as a live defect any more; the new describe block cites it as what the block demonstrates is fixed.
- `test/integration/postgres-misconfiguration.test.ts`: the `MarkerArrangement` type and its `it.each(['onFirstUse', false])` parameterisation are dropped — production no longer opens a runtime with the marker on, so the arms describing that shape no longer describe production. The dedicated "ticket 37's shape" test (`CliStructuredError` `3006` on a direct read) is deleted along with the `causeChain` helper it alone used. `failureOf` now builds its runtime through `postgresOptionsFor(url)` instead of a raw `{ contractJson, url, verifyMarker }` literal. The `retryMetaSpaceEstablishment` wrong-password case (start-up give-up, two attempts) now builds its runtime through `postgresOptionsFor(wrongPasswordUrl())` too, so it exercises production's options; this case was already marker-insensitive (`loadAggregate` is transactional) and stays green in the same shape. This file needs a real PostgreSQL to run and was not run here (see below) — the edits were made carefully and typechecked.
- `test/integration/sqlite*`: grepped for `verifyMarker`/`ticket 37`/`3006`; no hits, so nothing there referenced the marker or this defect.

**Docs updated:** the ADR 0095 entry in `AGENTS.md` (`CLAUDE.md` is a symlink to it) no longer lists ticket 37 among what remains open, and states it is resolved and how. Ticket 31's "Found on the way, not fixed here" cross-reference now says ticket 37 is resolved and how. Ticket 38's Resolution gained a dated amendment doing the same for its several mentions of ticket 37 (the historical narrative itself is left as written, since it is an accurate record of what ticket 38's implementer observed at the time).

**Verification:**

- `pnpm typecheck` — clean, both before and after the cleanup edits.
- `pnpm exec vitest run test/unit/postgres-unreachable.test.ts` — 15 passed (red confirmed first, per above).
- `pnpm verify` — reported in the handoff; see there for the exact command outputs.
- `pnpm test:integration:postgres` and `pnpm test:integration:sqlite` were **not run** — no PostgreSQL or migrated SQLite file is available to this agent, and the task explicitly forbade starting one. `test/integration/postgres-misconfiguration.test.ts` was typechecked and read through carefully instead; CI's `postgres` job runs it.
