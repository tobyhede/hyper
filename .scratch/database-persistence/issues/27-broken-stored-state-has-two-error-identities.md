# Broken stored state has two error identities, and only one is classified

Status: open
Tags: Defect
Blocked by: None — can start immediately.

Surfaced by: tightening a bare `rejects.toThrow()` while landing the SQLite truncation fix under ticket 17 and ADR 0094 (18 September 2026). The assertion was hiding it.

## The defect

`AggregateInvariantError` exists so that two unrelated failures arriving at a reader the same way can be told apart: broken stored state, which is a defect this deployment carries and no retry cures, and an unreachable database, which is temporary and a later attempt is exactly the answer (`packages/persistence/src/repository.ts`). `src/http/space-host.ts` asks `isAggregateInvariant` twice — at `:85`, where a read that failed on an invariant is re-read once rather than rethrown, and at `:149`, where it answers `internal-error` for broken state and `persistence-unavailable` — try again later — for everything else.

A stored `document` that is **not JSON at all** does not reach that identity. It fails inside the driver's json codec, before any intake of ours runs, as `TypeError: Cannot read properties of undefined (reading 'codecId')`. `isAggregateInvariant` walks the cause chain and finds nothing, so:

- `GET /` answers `persistence-unavailable` with "Try the request again later." for a defect no retry cures.
- `readAggregate` rethrows rather than re-reading.

A document that **is** JSON but fails Space intake raises `AggregateInvariantError` correctly, so the two flavours of the same category — stored state no aggregate can be read from — are classified differently. Verified on SQLite: `truncates a stored Space whose document is not JSON` in `test/integration/sqlite-space-repository.test.ts` pins `isAggregateInvariant(readFailure) === false`, and asserting `AggregateInvariantError` there fails with `expected error to be instance of AggregateInvariantError`.

Not checked on PostgreSQL. `repository.ts` says every implementation of the seam raises the identity "or a memory-backed test proves nothing about the database", so the same question is owed of `PostgresSpaceRepository` before anything is decided.

## To decide

- Where a codec failure is wrapped. Inside each repository's read, or once at a shared boundary. ADR 0095 plans one SQL repository over a per-database `SqlStore`, so there may come to be one place; today the two adapters are separate and `SqlStore` appears in no source file.
- Whether every throw out of a read is broken stored state by default, with the unreachable-database arm named explicitly instead — the inverse of the current classification, and possibly the honest one, since a driver that cannot decode what it stored is not a connectivity problem.
- What `GET /api/aggregate` should answer. `packages/http/src/index.ts` answers 503 for *every* throw out of `loadAggregate` and classifies nothing; `space-host.ts:134-148` already records that this is the half that cannot say a stored aggregate is broken, and that fixing it was not that ticket's. The identity is on the shared seam and reachable from there.

## Acceptance

- [ ] A stored document that is not JSON reaches the reader as `AggregateInvariantError`, on both SQL adapters, proven by an integration test on each.
- [ ] `test/integration/sqlite-space-repository.test.ts`'s pin is replaced by the assertion its siblings make.
- [ ] The host's two `isAggregateInvariant` calls are exercised for this flavour, not only for the intake one.
