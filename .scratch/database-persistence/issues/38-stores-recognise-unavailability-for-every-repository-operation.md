# 38 — Stores recognise unavailability for every repository operation

**What to build:** A database outage has the same persistence-unavailable outcome for every repository operation, including reads outside transactions and reloads after conflicts. HTTP answers 503 for recognised outages, while PostgreSQL authentication and missing-database failures remain unclassified and count toward startup giving up. Classification depends on evidence carried by the failure, never on whether a transaction callback ran.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Tags:** Defect

## Context and design

The PostgreSQL driver lets connection-acquisition failures escape without normalising them. The repository recognises normalised driver failures on every operation, but compensates for raw acquisition failures only around transactions: any failure before the callback runs becomes unavailable. Direct operations therefore miss a refused connection, while transactions misclassify bad configuration as an outage. This ticket includes the correction described by database-persistence ticket 36; that ticket is related work, not a prerequisite. Leave the source ticket unchanged when publishing this ticket.

Add an `isUnavailable(error)` predicate to the existing `SqlStore` interface, alongside its driver-specific duplicate-key predicate. Each adapter owns the knowledge needed to recognise its failures. The repository's existing naming operation asks the store only for otherwise unclassified failures, preserves already classified failures and their precedence, and wraps recognised failures with the original error as cause. A false predicate result means no evidence of unavailability; it does not assert permanence. Unavailability does not itself guarantee that retrying a write is safe.

PostgreSQL recognises the driver's connection errors, the existing unavailable SQLSTATE allowlist on normalised statement errors and raw acquisition errors, and an explicit justified allowlist of structured socket codes including ECONNREFUSED, ECONNRESET and ETIMEDOUT. Keep PostgreSQL policy in its adapter. Preserve bounded cause-chain traversal, including cycle protection. Unknown errors remain unclassified.

SQLite retains recognition of driver connection errors, including BUSY and LOCKED. Resolve closed-client recognition explicitly: the installed runtime throws a plain closed-client Error, and the existing proof closes the database directly. A flag set only by store.close cannot observe that case. Preserve direct-close behaviour with a narrowly contained and tested compatibility check for the pinned runtime's closed-client error, unless a structured signal is available; document that exception locally. Do not infer unavailability from all errors observed after closure or introduce a lifecycle redesign for this ticket.

Delete the repository's positional transaction classifier and its private forwarding method; transaction calls use the store directly. Do not wrap direct operations in transactions to obtain classification. Keep existing transaction, serialisation and conflict-reload semantics.

## Acceptance criteria

- [x] Through the repository interface, a refused PostgreSQL connection raises PersistenceUnavailableError for listSpaces, loadSpace, loadMetaSpaceId and markExported, as well as transactional reads, commits and aggregate lifecycle operations. Preserve the original failure as cause.
- [x] A commit that loses a revision race and then encounters an outage during its post-rollback reload is unavailable. Cover the corresponding Meta identity read used after an aggregate replacement conflict without nesting serialisation or reading through an aborted transaction.
- [x] Store-interface tests cover normalised connection failures, normalised and raw unavailable SQLSTATEs, structured socket failures, wrapped causes and cyclic cause chains. Raw acquisition codes 53300 and 57P03 remain unavailable; 28P01, 28000 and 3D000, unrelated errors and unknown codes do not become unavailable.
- [x] Reproduce at least one real PostgreSQL misconfiguration, such as an incorrect password, and record the error shape reaching the repository. Verify it stays unclassified through a transactional operation as well as a direct read.
- [x] SQLite operations after the underlying database is closed directly retain the unavailable outcome on transactional and direct paths. Existing BUSY/LOCKED behaviour remains covered, and unrelated plain errors stay unclassified.
- [x] HTTP proves a recognised direct-read outage is 503 persistence-unavailable and an unclassified configuration failure is 500 internal-error. Startup tests prove configuration failures count toward the existing confirming-failure limit and terminate retries, while recognised outages keep the existing outage retry behaviour.
- [x] Already classified broken stored state retains precedence; existing unavailable failures are not redundantly wrapped. Repository classification no longer inspects driver fields or infers availability from callback progress.
- [x] Update the existing unavailable-operation tests and explanatory comments to state the new rule, record any SQLite compatibility exception and the socket allowlist rationale, and pass the relevant repository, HTTP, startup and database integration checks plus normal verification.

## Resolution (2026-09-21, agent on branch `unavailable-arm`)

### What was built

- `SqlStore.isUnavailable(error)` (`src/persistence/sql-store.ts`) beside `isDuplicateKey`. The shared module keeps only the bounded, cycle-safe cause walk (`someCause`) and `isDriverConnectionFailure` (both drivers normalise to `SqlConnectionError`).
- PostgreSQL's policy in `src/prisma/sql-store.ts`: the driver's `SqlConnectionError`; `UNAVAILABLE_SQLSTATES` (moved here unchanged) on a normalised `SqlQueryError`'s `sqlState` **or** on an un-normalised error's `code` (raw `pg` `DatabaseError` from the handshake); and `UNAVAILABLE_SOCKET_CODES` on `code` — `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, `EHOSTUNREACH`, `ENETUNREACH`, `EAI_AGAIN`. `ENOTFOUND` is deliberately out (ordinarily a mistyped host). `28P01`, `28000`, `3D000` stay unclassified and the set's doc comment says so, beside the set.
- SQLite's policy in `src/sqlite/sql-store.ts`: `SqlConnectionError` (BUSY, LOCKED) plus the contained compatibility check below.
- `SqlSpaceRepository#naming` asks `store.isUnavailable` only for a failure `classifyStoredFailure` calls `unclassified`, wraps with the failure on `cause`, and otherwise rethrows unchanged. The positional rule and the private `#transaction` forwarder are deleted; the four transaction sites call `#store.transaction` directly. No direct read was wrapped in a transaction; serialisation and the post-rollback reads are unchanged.
- HTTP: `GET /api/spaces` and `GET /api/spaces/:id` now answer through `storedFailureProblem` like every other stored-seam route. Before, they answered 503 for **any** failure, so a configuration failure told a client to wait. The browser's `HttpSpaceBackend` treats every non-OK list/load status alike, so no client behaviour changes.

### SQLite compatibility exception

`@prisma-next/sqlite` 0.16.0 raises `new Error("SQLite client is closed")` from `getRuntime`, `connect` and `transaction` once `close()` has run (`dist/runtime.mjs`), with no structured field. `isClosedClient` in `src/sqlite/sql-store.ts` recognises exactly that: prototype exactly `Error.prototype` and message exactly that text, anywhere on the chain. `test/unit/sql-connection-failure.test.ts` raises the error from the pinned runtime itself, so an upgrade that changes it fails there. A subclass carrying the same text, and every other plain error, stay unclassified. Nothing else seen after a close is read as unavailable, and there is no lifecycle flag.

### Error shapes observed (through the real `pg` driver, 2026-09-21)

A loopback server that answers the startup message with a FATAL `ErrorResponse` (`test/support/refusing-postgres-server.ts`) was used. The driver acquires connections with a bare `pool.connect()`, so:

- `loadAggregate` (transaction) and `loadSpace` (autocommit `include` read) receive raw `pg` `DatabaseError`, message `password authentication failed for user "hyper"`, `code: '28P01'`, `severity: 'FATAL'`, no `cause`.
- `listSpaces` with `verifyMarker: false` receives `SqlQueryError` (`kind: 'sql_query'`, `sqlState: '28P01'`) whose `cause` is that same `DatabaseError`.
- `listSpaces` with the default `verifyMarker: "onFirstUse"`, as its runtime's first statement, receives `CliStructuredError` `code: '3006'` "Database error while reading contract marker", with no `cause`. This is ticket 37. It stays unclassified: such a read, as the first statement of a runtime during an outage, answers 500, not 503. Observed against port 1 (a real `ECONNREFUSED`) for both `listSpaces` and `loadMetaSpaceId`.
- A server that is not listening (port 1): `loadAggregate`, `loadSpace` and `markExported` get Node's raw `Error` `code: 'ECONNREFUSED'`; `listSpaces`/`loadMetaSpaceId` (marker off) get `SqlConnectionError` with that error on `cause`.

**A real PostgreSQL misconfiguration: written, awaiting its first run.** `test/integration/postgres-misconfiguration.test.ts` is in `pnpm test:integration:postgres`. It derives two URLs from the migrated `DATABASE_URL`, read through `configuredDatabaseUrl` (`src/prisma/db.ts`, which `createPostgresDatabase` now also reads through):

- the same URL with a wrong password, which the server refuses through its SCRAM login: expected `28P01`;
- the same credentials naming `hyper_ticket_38_absent`: expected `3D000`.

For each, on a fresh runtime per operation (a failed marker read is cached per runtime, ticket 37), it asserts that neither is `PersistenceUnavailableError` and that `classifyStoredFailure` answers `unclassified`. It also asserts the stand-in's shapes above, now as hypotheses about a real server:

| Operation | `verifyMarker` | Expected shape |
| --- | --- | --- |
| `loadAggregate` (transaction) | `'onFirstUse'` and `false` | raw `pg` `DatabaseError`: `code` the SQLSTATE, `severity: 'FATAL'`, no `kind`, no `cause` |
| `listSpaces` (direct) | `false` | `SqlQueryError` `kind: 'sql_query'`, `sqlState` the SQLSTATE, `cause` that `DatabaseError` |
| `listSpaces` (direct) | `'onFirstUse'` | `CliStructuredError` `code: '3006'`, no `cause`; the SQLSTATE is nowhere on the chain (ticket 37) |

A third case runs `retryMetaSpaceEstablishment` over the wrong-password URL with the default marker. It expects start-up to give up after two waits (`5_000`, `10_000`), with both reported failures unclassified and carrying `28P01`. Its `wait` rejects after five calls, so a refusal read as an outage fails the case rather than retrying until the timeout.

**Observed against a real server.** Port 55432 was taken on the machine this was written on, so the proof was first run through the refusing stand-in, once answering `28P01` and once `3D000`, and was green; with the PostgreSQL store's `isUnavailable` forced to `true`, every case went red, the start-up case through its bounded `wait`. CI run 35571560104 (`661ddfa4`) then ran `test/integration/postgres-misconfiguration.test.ts` in the `postgres` job against PostgreSQL 17 doing a real SCRAM login: all 9 cases passed, so a real server produces the shapes in the table above, and the rest of `test:integration:postgres` and every other CI job passed with it.

### Proofs

- Store interface: `test/unit/sql-connection-failure.test.ts` (both stores).
- Repository, PostgreSQL driver: `test/unit/postgres-unreachable.test.ts`. It covers the refused connection on all four direct operations plus the transactional ones, and 28P01/28000/3D000 unclassified versus 53300/57P03 unavailable on transactional and direct paths. It also has HTTP 503 vs 500 for the direct reads. The direct-read cases turn `verifyMarker` off so they observe the connection rather than ticket 37.
- Repository, SQLite (`test/integration/sqlite-space-repository.test.ts`): every operation on a closed database is unavailable. Also covered: an outage in the post-rollback conflict reload, an outage in the Meta identity read after a replacement conflict, and named failures (unavailable, broken stored state with an outage on its chain) passed through unwrapped. The PostgreSQL-SQLSTATE stand-in cases now name PostgreSQL's recognition explicitly.
- Start-up: `test/unit/database-startup.test.ts`. Through the real driver, a wrong password gives up after two attempts, and too many connections keeps waiting past the confirming limit.

### Known history blemish

From `f75d1ced` (the repository began asking the store) until `71c41e57`, two SQLite integration cases were red under `vitest.sqlite.config.ts`: "names a statement PostgreSQL aborted for contention unavailable" and "keeps start-up trying through contention". They injected PostgreSQL SQLSTATEs into a SQLite store and had relied on the shared predicate. `pnpm test` was green throughout, because those files are not in the unit config. They were fixed in `71c41e57`.

### Amendment, 2026-09-21 — ticket 37 is resolved

The cached contract-marker failure named throughout this Resolution — "This is ticket 37" above, the per-runtime cache that made `test/integration/postgres-misconfiguration.test.ts` build a fresh runtime per operation, and the `verifyMarker: false` arms `test/unit/postgres-unreachable.test.ts` and that integration file carried so a direct read observed the connection rather than the cached failure — is fixed. `createPostgresDatabase` (`src/prisma/db.ts`) and the SQLite runtime's options (`src/sqlite/db.ts`) now both construct their runtime with `verifyMarker: false`, so the contract-marker check — which only ever logged on drift in the installed 0.16.0 and never refused a query — can no longer memoise a failed read for the runtime's life; a direct read during an outage now meets the connection itself. The tests above that turned the marker off for that reason build their runtime through `postgresOptionsFor` (`src/prisma/db.ts`) instead, and no longer need a separately-configured one; the `'onFirstUse'` arms in `test/integration/postgres-misconfiguration.test.ts`'s table above are dropped, since production no longer opens a runtime that way. See `.scratch/database-persistence/issues/37-a-failed-contract-marker-read-is-cached-for-the-life-of-the-runtime.md`.

