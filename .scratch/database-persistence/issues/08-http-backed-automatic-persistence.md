# 08 — HTTP-backed automatic persistence

**What to build:** Connect the browser's existing `SpaceBackend` contract to `SpaceRepository` over HTTP so normal app edits are automatically durable in PostgreSQL with honest pending, conflict, failure, and retry behavior.

**Blocked by:** 02 — Memory-backed automatic persistence; 04 — PostgreSQL space repository.

**Status:** resolved

- [x] `HttpSpaceBackend` passes the same behavioral contract suite as `MemorySpaceBackend`.
- [x] HTTP handlers translate list, load, and revision-checked commit requests without duplicating repository validation or transaction rules, mapping the narrower repository result into HTTP outcomes.
- [x] Request bodies are bounded and validated before reaching the repository.
- [x] Browser requests cannot name database connections, filesystem paths, or arbitrary storage targets.
- [x] The browser-facing commit result distinguishes success with revision, conflict with current stored state, retryable failure, and permanent failure without leaking those transport classifications into `SpaceRepository`.
- [x] HTTP maps `200` to success; `409` to conflict; `400`, malformed responses, `401`, `403`, `404`, and `422` to the corresponding permanent failure; and `408`, `429`, `5xx`, timeouts, and network failures to retryable failure.
- [x] The normal app runtime uses `HttpSpaceBackend`; the memory implementation remains available for isolated UX development and tests.
- [x] Edits remain optimistic and are committed in order per space.
- [x] Successful commits install the returned revision; only failures classified as retryable offer retry, and the session never retries automatically.
- [x] A stale commit becomes a visible conflict and cannot blindly overwrite current database state.
- [x] Navigation protection is present only for pending, failed, rejected, or conflicted persistence.
- [x] The old Vite virtual-space loader, file-save endpoint, read-only save mode, and Save-specific tests are removed once no longer referenced.
- [x] Application and end-to-end tests prove durability across a reload, ordered rapid edits, conflict reporting, failure retry, and unchanged route-activation behavior.

## Answer

This answer records the transport first shipped by this resolved increment.
ADR 0034 and `.scratch/fetch-native-http/` later replaced its raw Node handler
with the Fetch-native Hono application and typed client.

`HttpSpaceBackend` now uses a strict lossless JSON protocol over fixed
`/api/spaces` resources. The Node handler bounds commit bodies at 1,048,576 raw
bytes, validates transport shape before repository access, preserves `bigint`
revisions as decimal strings and delegates domain intake, optimistic concurrency
and transactions to `SpaceRepository`. Browser classifications are status-first:
retryable transport failures never leak into the repository contract, malformed
success/conflict responses are permanent protocol failures, and no request can
name a database connection, file path or storage target.

Normal Vite composition starts `PostgresSpaceRepository` behind that handler and
the browser opens through `HttpSpaceBackend`. Standard Playwright remains
database-free but uses the same HTTP composition with one isolated memory
repository per test. It proves ordered/coalesced rapid edits, reload durability,
explicit network retry, visible stale conflict without blind overwrite,
navigation protection and unchanged route activation. The opt-in PostgreSQL
browser test imports one unique Space, commits an edit, starts a fresh Vite host,
observes the same revision and placement, then deletes only that Space.

Verification on 2026-07-31:

- `pnpm verify`: 56 files and 460 tests passed with coverage.
- `pnpm e2e`: 35 browser tests passed.
- `pnpm test:integration:postgres`: 3 files and 32 tests passed.
- `pnpm e2e:postgres`: 1 restart-durability test passed.
- The isolated PostgreSQL container was stopped with `pnpm postgres:down`.
