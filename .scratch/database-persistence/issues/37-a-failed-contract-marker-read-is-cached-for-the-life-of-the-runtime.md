# 37 — A failed contract-marker read is cached for the life of the runtime

Status: needs-triage

Tags: Defect

Blocked by: None.

Surfaced by: ticket 31's implementation, recorded in its `## Answer` under "Found on the way, not fixed here", which asked for its own ticket; filed from a code review of that implementation (2026-09-21).

## What was observed, and what was only read

**Observed (ticket 31, probed):** `listSpaces` against a PostgreSQL server that refuses connections rejects with `CliStructuredError` code `3006`, "Database error while reading contract marker". It has no `cause`; the driver's own reason is only in its `why` prose.

**Read, not reproduced (re-read here against `node_modules`, `@prisma-next/*` 0.16.0):**

- `@prisma-next/sql-runtime`'s `SqlRuntimeBase` (`dist/exports-D5-Py3YP.mjs`) holds one `verifyMarkerPromise`. The constructor sets it to `null` under the default `verifyMarker: "onFirstUse"` (neither `src/prisma/db.ts` nor `src/sqlite/db.ts` passes the option). `streamRows` assigns it once — `if (this.verifyMarkerPromise === null) this.verifyMarkerPromise = this.verifyMarker();` — then awaits it. Those are the only two assignments in the file: nothing resets it when it rejects.
- `verifyMarker` awaits `familyAdapter.markerReader.readMarker(this.driver)` with no `catch` of its own. A missing or mismatched marker only logs a warning; a *failed read* rejects.
- `@prisma-next/errors`' `rethrowMarkerReadError` turns a driver failure during that read into `errorMarkerReadFailed`, which is the `3006` above, carrying the original message as `why` and no `cause`.
- Every statement reaches `streamRows` through `executeAgainstQueryable`, transactional ones included.

So, by that reading: the first statement a runtime runs while the database is unreachable caches a rejected promise, and every later statement on that runtime — after the database comes back — awaits the same rejection and fails with `3006`. Only a new runtime (a host restart) recovers. `GET /api/spaces` during a start-up outage is one way to be that first statement.

## Why it matters here

`3006` carries neither a `SqlConnectionError` nor a SQLSTATE on its chain, so `SqlSpaceRepository` leaves it `unclassified` (ticket 31, amended — `isDriverConnectionFailure` and `isUnavailableStatementFailure` both read the chain and find nothing). HTTP answers 500, and start-up counts it toward giving up: two in a row and `retryMetaSpaceEstablishment` returns `undefined`. If the reading holds, that give-up is the right answer for the runtime as it stands — no wait cures a cached rejection — but the runtime should not be in that state at all: the outage has passed and the host is still dead.

## Acceptance (draft)

- [ ] Reproduce: start a host against a stopped PostgreSQL, issue one statement, start PostgreSQL, and show whether the next statement on the same runtime still fails with `3006`. Record the result either way; if it does not reproduce, say which step of the reading above is wrong and close this.
- [ ] If it reproduces, decide where the fix lives: upstream in `@prisma-next/sql-runtime` (reset `verifyMarkerPromise` on rejection), in this repository's runtime construction (e.g. `verifyMarker: false`, stating what that gives up), or in the store rebuilding its runtime after a marker failure.
- [ ] Whatever the fix, a test that fails today: one failed marker read followed by a successful statement on the same repository.
