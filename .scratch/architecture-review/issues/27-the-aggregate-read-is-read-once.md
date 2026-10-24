# The aggregate is read once

Status: done
Tags: Improvement
Blocked by: None — can start immediately. Built after the 30 October 2026 talk, by decision.

Surfaced by: the 24 October 2026 architecture review of `main` at `b46ea0c6`, candidate 02 ("Give Aggregate read confirmation one owner"), then settled by a grilling loop on 24 October 2026 against `main` at `953dac3`. The grilling reversed the candidate: the rule it proposed to give one owner guards a race that no longer exists, so it is deleted rather than shared.

## The defect

Two readers load the aggregate and, when the first read fails with broken stored state, read it a second time before letting that failure stand:

- `readAggregate` in `packages/aggregate/src/space-host.ts:83-90`, for `GET /`;
- the `SPACE_AGGREGATE_PATH` route in `packages/http/src/index.ts:557-564`, which mirrors it rather than sharing it because `@project/aggregate` depends on `@project/http`.

Both comments justify the second read the same way: on PostgreSQL `loadAggregate` reads the Meta identity and the Spaces in two statements at READ COMMITTED, so a rival host committing between them shows a healthy store as "Spaces without Meta" for an instant.

That race is closed. Ticket `database-persistence/31` kept the re-read because "when there is no Meta row there is nothing to lock". Ticket `database-persistence/42` then acquired `pg_advisory_xact_lock(1213812818, 1)` (`SqlStore.lockAggregate`, `src/prisma/sql-store.ts`) before the Meta identity read on every aggregate path — `initializeAggregate`, `replaceAggregate`, `loadAggregate` and the full commit (`#lockMetaIdentity`, `src/persistence/sql-space-repository.ts:752`) — and that lock is held whether or not a Meta row exists. Every statement after it sees no aggregate writer mid-way. `test/integration/postgres-aggregate-initialization.test.ts` holds it: "reads a consistent uninitialized aggregate while another runtime initializes it". On SQLite the race was never reachable in-process (ticket 31's Answer, item 4).

The two re-reads therefore cover nothing, and the comments in four files state a reason that ticket 42 removed. The conclusion is from reading the source; PostgreSQL was not run while grilling, so CI's `postgres` job is the proof.

## Decided

- Delete both re-reads. `GET /` and `GET` on the aggregate path each call `repository.loadAggregate()` once and classify what it throws exactly as they do today (`storedFailureProblem` and `space-host.ts`'s `classifyStoredFailure` switch): broken stored state is a 500, unavailable a 503.
- Do not give the rule one owner in `@project/persistence`, which is what the review proposed. A shared owner for protection against nothing adds a module without adding depth.
- Startup keeps `CONFIRMING_FAILURES = 2` (`src/startup/database-startup.ts`). Its comment is rewritten to rest on the reason that still holds — a one-off is not a verdict and a defect repeats — and no longer on the race. Startup's behaviour does not change.
- One line on `SqlSpaceRepository.loadAggregate` names the integration test that holds its consistency against a concurrent initializer, so a later review does not re-suggest a re-read.
- No ADR and no `CONTEXT.md` entry. This records a fact about a lock rather than a trade-off; ticket 42 is where the lock was decided.

## Acceptance

- [x] `readAggregate` in `space-host.ts` is gone, or reads once; nothing in `packages/aggregate/src` or `packages/http/src` calls `loadAggregate` twice for one request.
- [x] The comments in `space-host.ts`, `packages/http/src/index.ts` and `src/startup/database-startup.ts` no longer cite the READ COMMITTED race as live.
- [x] `packages/http/test/space-http-app.test.ts`: `re-reads once on an invariant failure and answers 200 when the retry succeeds` goes; the `it.each` cases around it keep asserting each failure's status on a single read, and the "without re-reading" wording goes.
- [x] `test/unit/vite-hono-host.test.ts`: `reads again before calling one invariant failure a verdict` and `calls it a verdict when the second read fails the same way` become one case — one invariant failure on `GET /` is a 500 after one read.
- [x] `test/unit/database-startup.test.ts`: `keeps trying through one invariant failure, which can be a healthy race` keeps its assertions under a name and comment that do not claim the race; the `ScriptedRepository` doc comment (around :170) likewise.
- [x] `SqlSpaceRepository.loadAggregate` carries the one line naming `postgres-aggregate-initialization.test.ts`.
- [x] `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm exec eslint` over the changed files and `pnpm exec vitest run` over the changed tests clean locally; `CI passed` green on the PR, the `postgres` and `sqlite` jobs included.

Out of scope: startup's retry policy beyond its comment; any retry of `commit`, which was never retried (`packages/http/src/index.ts`'s commit route says why); `loadSpace` and `listSpaces`.
