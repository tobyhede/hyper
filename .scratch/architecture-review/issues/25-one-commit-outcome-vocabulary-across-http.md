# One commit outcome vocabulary across HTTP

Status: resolved
Tags: Improvement
Blocked by: None — can start immediately.

Surfaced by: the 17 September 2026 architecture review of the database-persistence branch, candidate 2, then settled by a grilling loop and recorded as ADR 0098. Candidate 1 of the same review was rejected as ADR 0094; candidate 3 is ticket 24 and ADR 0095.

## The defect

A commit outcome changes shape at every hop, and the status table exists on both ends of the seam.

- `RepositoryCommitResult` (`packages/persistence/src/repository.ts:62-71`) has four arms; `CommitResult` (`packages/persistence/src/backend.ts:43-65`) restates three of them word for word and adds the transport failures. Neither is derived from the other, and the three shared arms have no name.
- The Hono route (`packages/http/src/index.ts:367-384`) matches `committed`, `conflict` and `aggregate-refused` with three `if`s and falls through to a 400 `invalid-request` with `pointer: ''` for anything else. A fifth arm on `RepositoryCommitResult` would be served as a malformed request, carrying whatever prose it happens to hold, and would typecheck. The browser maps the same three status codes back (`packages/http/src/backend.ts:116-132`), with nothing holding the two tables together.
- The identity rule is written twice with identical prose: `decodeCommitRequest` (`packages/persistence/src/http-protocol.ts:337-346`) and `commitIdentityRefusal` (`packages/persistence/src/commit-decision.ts:33-53`). Over HTTP the codec answers first, so the repository's copy never runs there and nothing tests that they agree. Both answers are identical on the wire — `decodeCommitBody` (`packages/http/src/index.ts:238-254`) turns a codec throw into the same 400 `invalid-request`, same detail, same `pointer: ''`, that the route makes of a `rejected` result — so the codec's copy changes nothing observable.
- `test/unit/hono-http-backend-contract.test.ts:70-95` wraps `MemorySpaceBackend` as a repository and maps backwards, throwing on arms it cannot represent, so the HTTP path is exercised over the backend rather than over a repository. `test/support/memory-space-repository.ts` is a real `SpaceRepository` running `decideCommit` and was available.

## Decided

Recorded as ADR 0098.

- `CommitOutcome` — `committed | conflict | aggregate-refused` — is declared once in `packages/persistence/src/backend.ts`. `RepositoryCommitResult` is `CommitOutcome | rejected`; `CommitResult` is `CommitOutcome | retryable-failure | permanent-failure`. Not `Exclude`: the shared arms get a name, so both seams are read as sharing a vocabulary rather than as one seam minus a case.
- One status table in `http-protocol.ts`, beside the codecs: `COMMIT_OUTCOME_WIRE` pairs each outcome kind with its status and its decoder, `satisfies Record<CommitOutcome['kind'], …>`. The route reads the statuses, `commitOutcomeDecoder(status)` answers the decoder for an outcome status or `undefined`, and a new arm is a compile error at both ends.
- The browser's failure classification (`commitFailureForProblem`) stays where it is. No server code has an opinion on a timeout or a rate limit, and this keeps candidate 4 — one persistence failure classification — out of this ticket.
- `decodeCommitRequest` decodes shape only. The identity rule is `commitIdentityRefusal`'s alone, which every repository runs (ADR 0095) and `test/support/repository-contract.ts:838,869,930` holds all of them to.
- `test/unit/hono-http-backend-contract.test.ts` drives `createSpaceHttpApp` over `MemorySpaceRepository`; the backwards map goes.

Also decided, and not done: no `CONTEXT.md` entry. `CommitOutcome` names a TypeScript union shared by two internal seams, not something an author encounters; `CONTEXT.md` holds product vocabulary.

Not exported: `memory.ts`'s `backendResult` lift stays private. Once the contract test stops mapping backwards it has one consumer, and exporting it would be for a second that does not exist.

## Acceptance

- [x] `CommitOutcome` is declared once and both result types are written in terms of it; no arm is restated.
- [x] The route matches every arm in one switch that must return, pairing each body with a status from the table. — an added fourth outcome fails `tsc` in two places: `packages/http/src/index.ts` ("Not all code paths return a value") and the table's `satisfies` ("Property 'deferred' is missing"). Checked by adding an arm, running `tsc`, and reverting.
- [x] The browser transport reads the same table through `commitOutcomeDecoder`, and reads no response body before it knows the status is an outcome status.
- [x] `decodeCommitRequest` no longer checks duplicate Space ids or snapshot identity; the two cases in `packages/http/test/space-http-app.test.ts:658-667` and the two in `packages/persistence/test/http-protocol.test.ts:128-147` go, the wire answer staying covered by `maps a rejected commit to request correction` and the rule by the repository contract.
- [x] `test/unit/hono-http-backend-contract.test.ts` composes the app over `MemorySpaceRepository` with no repository→backend mapping in the harness.
- [x] `pnpm exec tsc --noEmit` clean; `pnpm exec eslint` clean over the changed files; `pnpm exec prettier --check` clean after formatting two files; `pnpm exec vitest run` green — 223 files, 2749 tests, the whole non-database suite rather than the named packages, since it costs under a minute. The database suites and `e2e` are CI's.

Out of scope: candidate 4 (one persistence failure classification), which touches the same routes; the `pointer: ''` shape of the `invalid-request` answer; anything about `AggregateInvariantError`.

## Answer

Implemented across `packages/persistence/src/{backend,repository,http-protocol,index}.ts` and `packages/http/src/{index,backend}.ts`.

**The shared type.** `CommitOutcome` sits in `backend.ts`, below `RepositoryCommitResult` in the import graph so both can name it, and `repository.ts` dropped three imports it no longer needs. Nothing else changed: every arm kept its shape, so no consumer of either result type moved.

**The table, and what Hono made of it.** The first shape had `encodeCommitOutcome(outcome)` answer `{ status, body }` and the route return `context.json(body, status)` — one call site, the whole status table in the codec module. `packages/http/test/space-http-app-types.test.ts` caught it: the typed client infers each status's response body from the literal types at the `context.json` call, and destructuring de-correlates them, so `InferResponseType<$post, 422>` became the union of all three bodies and the test's `AggregateRefusal['errors']` stopped existing. The encoders therefore stay at the route, called in a `switch (result.kind)` that must return, and the table holds each kind's status and decoder. The kind↔status pairing still exists once, and the route reads it (`COMMIT_OUTCOME_WIRE.conflict.status`).

**The identity rule.** Deleting the codec's copy changed no wire answer: `decodeCommitBody` already turned a codec throw into the same 400 `invalid-request`, same detail, same `pointer: ''`, that the route makes of a `rejected` result, and the messages were identical strings. The two cases in `packages/http/test/space-http-app.test.ts`'s guard list went with it — the wire answer stays covered by `maps a rejected commit to request correction`, and the rule by `test/support/repository-contract.ts`, which holds all three repositories to it. `test/unit/import-decoding.test.ts` uses the codec only for snapshot validation prose and was untouched.

**The harness.** `spaceBackendContract` now composes the app over `MemorySpaceRepository`, seeded under the first Space's Meta identity, which is the aggregate the contract asserts. The backwards map is gone. Its `permanent-failure → rejected` branch had never run: the contract exercises `committed`, `conflict` and `aggregate-refused` and no `rejected` case at all.

## Review findings (18 September 2026)

A review over the diff raised four findings, and a second round raised three more. Resolved as follows.

- [x] **The table is exhaustive over kinds, not over statuses (medium).** `satisfies Record<CommitOutcome['kind'], …>` proves every kind has a status; it says nothing about two kinds sharing one, and the browser reads the table in the direction the guard does not cover — it holds a status and wants a decoder. Two kinds on 422 would compile, and `commitOutcomeDecoder` would hand the second the first's decoder. Closed by a test rather than by types: `gives every commit outcome a status of its own, and decodes each by it` asserts the statuses are distinct and round-trips each outcome through the decoder the table chooses for its status.
- [x] **The harness re-introduced the ordering inference ADR 0078 refuses (medium).** Seeding `MemorySpaceRepository` with `initial[0].snapshot.id` as the Meta identity is exactly the "whichever Space is first is Meta" reading the constructor's overloads exist to make unwriteable — at the one call site they cannot police. `spaceBackendContract` now hands the harness a `BackendContractSeed` naming the Meta identity, both harnesses take it, and `memory-backend.test.ts`'s own `FALLBACK_META_ID` inference goes with it. The dead `first === undefined` branch went too.
- [x] **The empty change set (medium, from the second round).** Commit `15c6957e` (ticket 20) moved the commit rules into `decideCommit` and removed both memory implementations' explicit empty-set guards; `decideCommit` never grew one, so an empty change set passes every refusal, produces an empty candidate identical to storage, and answers `committed` having written nothing. Verified against the history, not taken on report. It is unreachable from TypeScript — `SpaceCommit['changes']` is a non-empty tuple, and `decodeCommitRequest` refuses an empty array over HTTP — so the guard is for a JavaScript caller. `commitIdentityRefusal` now refuses it, and its parameter is widened to a plain change list, which is what lets the branch be *reached* by a test instead of being uncoverable code; `packages/persistence/test/commit-decision.test.ts` is that test. It is renamed `commitRequestRefusal`, because identity was only two of the three things it now refuses. The rename was briefly deferred over a stale handoff note claiming another session held `src/persistence/sqlite-space-repository.ts`; that session had finished the evening before, and its work is committed as `9c68ecd6`.
- [x] **The SQLite restart proof clears only at the end (correctness, from the second round).** Its PostgreSQL twin clears *before* seeding, with a comment giving the reason: `initializeAggregate` leaves an initialized repository as it is (ADR 0078), so a file still holding a Space from a run that failed before its own cleanup answers `already-initialized`, writes nothing, and the drag then looks for a Thing that was never stored. The SQLite spec cleared at the end of its `try` only, so a failed run poisoned the next one — the very thing its cleanup comment claims to prevent. It now clears before seeding as well.

Rejected, with reasons:

- **A `default` arm answering an impossible `result.kind` (low).** The suggestion was an exhaustiveness `never` check plus a logged `internal-error`, because a structurally-satisfied `SpaceResourceRepository` can return an arm no case names and falling out of the handler answers a POST with Hono's 404 `text/plain`. It cannot be written here: `@typescript-eslint/switch-exhaustiveness-check` errors on a `default` under an exhaustive switch, and rewriting the switch as an `if` chain moves the error to `@typescript-eslint/no-unnecessary-condition` on the final always-true comparison. Both were confirmed by running lint. Two rules saying the same thing is a standing position — a discriminated union is trusted at runtime — and overriding it is a decision of its own, not this ticket's.
- **`clearSqliteContent` reading rows through the JSON codec (correctness).** Real, and the same hazard as the uncommitted `truncateHyperContent` change; the suggested fix uses `select('id')` and `deleteCount()`, which exist **only** in `src/persistence/sqlite-space-repository.ts` in another session's working tree. Fixing it here would put an unlanded API into this commit and collide with that session. It belongs to whoever lands that change.
- **A bare `rejects.toThrow()` in `test/integration/sqlite-space-repository.test.ts` (low).** That file is the other session's uncommitted work and is not touched by this ticket.
