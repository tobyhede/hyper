# Bring persistence onto the refusal pattern

Status: built — the original scope landed 2026-09-10 and the follow-up below on 2026-09-23

Surfaced by: investigating whether persistence error handling should be extracted as the application-wide error pattern. It should not — see `spec.md`, which also keeps the original findings in the present tense they were written in.

## The rule

ADR 0057: an expected failure crosses a seam as a stable identity with typed context, and the application owns the sentence. `AuthoringRefusal` plus `describeAuthoringRefusal` were the reference implementation. Persistence departed from it in three ways — transport prose (`problem.detail`, a thrown `Error`'s text) reached the screen through a failure's `message`; its copy tables lived inside `PersistenceControl`; and `acceptStoredSpace` returned English across the Authoring seam.

## What is built

Every claim here was re-checked against the tree on 2026-09-23.

- **Every persistence failure code has application-owned copy.** `PERSISTENCE_FAILURE_REASONS` and `describePersistenceFailure` in `packages/app/src/authoring-refusal.ts` cover all eight `retryable-failure`/`permanent-failure` codes, and `satisfies Record<PersistenceFailure['code'], string>` makes a new code fail to compile until it has a sentence.
- **Eight codes, not the seven the ticket started with.** `protocol` was a bucket carrying `payload-too-large`, the one permanent failure an author can act on; a shared sentence about format disagreement would have dropped the only instruction they had. The split is recorded on `CommitResult` in `packages/persistence/src/backend.ts`. It departs from this ticket's original "the codes stay as they are" deliberately — it preserves behaviour rather than re-partitioning for tidiness.
- **No wire prose reaches a surface.** `packages/http/src/backend.ts` no longer copies `problem.detail` anywhere: since the follow-up below, a persistence failure has no `message` to copy it into.
- **`NETWORK_FAILURE_MESSAGE` is gone**, and `@project/http` exports no display copy. The inline literal that stood in for a thrown non-`Error`'s message went with the field.
- **`acceptStoredSpace` answers `StoredSpaceRefusal | null`** (`packages/app/src/space-authoring.ts`): `stored-space-deleted`, or `stored-space-invalid` carrying intake's `SpaceError[]` as typed context. `describeStoredSpaceRefusal` names up to three offending ids and counts the rest, in the alert's own text — `role="alert"` announces what it contains, so a reason in a `title` attribute never reaches a keyboard or touch user. `packages/app/test/SpaceApp.test.tsx` ("refuses an unloadable remote snapshot…") pins both the sentence and the id.
- **One module holds the sentences.** `CONFLICT_DESCRIPTIONS` (`describeConflictRecovery`) and `AGGREGATE_REFUSAL_REASONS` (`describeAggregateRefusal`) live in `authoring-refusal.ts` beside the Authoring copy. The aggregate table had already moved there under `v1-release/17`, so there was nothing to coordinate.
- **ADR 0057's `Build status:` and `docs/agents/ui.md`** say persistence follows the rule.

## What the review pass added

Three defects and a missing pin, found reviewing the branch before it merged.

- **The `payload-too-large` sentence blamed one long Resource and offered a retry.** `MAX_COMMIT_BODY_BYTES` limits the whole serialised snapshot — a Space can exceed it on Resource count with nothing long in it — and the rejection dialog offers only Continue editing. The sentence now names the Space as a whole ("larger than the server accepts in one save") and names no retry.
- **`ConflictControl` kept a refusal across two conflicts.** Its remount key collapsed to a constant for every conflict without a stored snapshot, so one coordinated conflict's "unable to reload" alert stood over the next. The key is gone; the refusal is held beside the conflict that raised it and discarded when the conflict changes.
- **A dismissed rejection came back on the way back to the Space.** The acknowledgement sat below `PersistenceControl`'s `active` gate, which unmounts everything the component returns. It now lives above the gate, in the component Open Spaces keeps mounted.
- **The invariant the acknowledgement rests on is pinned.** With `message` unread, two rejections are told apart only by the identity of the failure object the session published, so a fresh result per commit is load-bearing. `packages/http/test/http-backend.test.ts` "mints a distinct failure for each rejected commit" holds it. The alternative — a sequence number minted by the session — would widen `SpaceSessionState` to carry one component's bookkeeping.

## The follow-up

One change with two parts, done together because the second edits the arms the first is already rewriting. It was deferred until `command-dock/07` landed, because that branch was rewriting several of the construction sites. `command-dock/07` is resolved (`08467445`), so nothing blocks this now.

### 1. Delete `CommitResult`'s `message` field

Both failure arms of `CommitResult` (`packages/persistence/src/backend.ts`) carry a `message` that no surface, log or diagnostic reads, so it is dead rather than diagnostic. Measured on 2026-09-23: 86 construction sites across 23 files, most of them tests. The largest are `test/unit/http-space-backend-failures.test.ts` (14), `packages/persistence/test/space-resource-lifecycle.test.ts` (10), `packages/app/test/authoring-refusal.test.ts` (10) and `packages/http/src/backend.ts` (9). `packages/app/stories/support/CommandDockFixture.tsx` and `packages/app/stories/surfaces/resources-popover.stories.tsx` are among them, so `pnpm e2e:ladle` applies.

Two sites need a decision rather than deletion alone:

- `packages/persistence/src/memory.ts`'s `backendResult` copies `RepositoryCommitResult`'s `rejected.message` across. That is the **stored** seam's field, which the HTTP host turns into `problem.detail`; it stays. Only the browser-side copy goes.
- `packages/http/src/backend.ts`'s `protocolFailure(message)` and its four callers carry the only record of *which* wire expectation broke (wrong media type, status mismatch, malformed body, an unexpected problem code). Whether that becomes typed context or is dropped is part 2's call.

### 2. Give synthesised `protocol` failures typed context

Five broken-invariant paths synthesise a `protocol` failure and put their only diagnostic in `message`. With `message` unread, that diagnostic currently reaches nobody:

- `packages/persistence/src/session.ts` — a commit result that omits this Space's revision (the Space id is in the message), and a conflict result that omits the current Space (likewise).
- `packages/persistence/src/session-registry.ts`'s `protocolFailure` — the coordinated persistence read threw, the coordinated commit threw, and a commit result omitted a coordinated Space's result.

None of these is an authored condition, so the fix is diagnosability, not copy: the author keeps reading the `protocol` sentence. What the typed context carries — the Space id, the thrown value, a discriminant naming the broken invariant — and where it is surfaced (a reported error through the existing `reportObserverError`-style sink, or a field on the failure that a diagnostic can read) is the implementation call. Do not reintroduce a free-text field under another name; that is the shape ADR 0057 rejected.

### As built

- **`message` is gone from both failure arms.** Every construction site in `packages/` and `test/` lost it. `memory.ts`'s `backendResult` carries the code alone; `test/support/aggregate-commit-differential.ts` now compares a repository's `rejected` against the memory backend in the browser's vocabulary, by code, since the memory side has no `message` left to compare. Tests that asserted the wire's prose was *not* drawn from a failure value (`authoring-refusal.test.ts`, `persistence-control.test.tsx`, `SpaceApp.test.tsx`, the Ladle `resources-popover` spec) lost that half, because there is no prose in the value to leak; every sentence they pin is unchanged. `e2e/http-persistence.spec.ts` keeps its end-to-end check that a real 403's `detail` never reaches the screen.
- **The `protocol` arm is its own member of `CommitResult` and requires `fault: ProtocolFault`** (`packages/persistence/src/backend.ts`), a closed union naming the broken expectation. The other permanent codes carry nothing. `describePersistenceFailure` still reads only `code`.
  - `session.ts`: `revision-omitted` and `conflict-omitted-space`, each with the Space id; and `unexpected-deletion` (`spaceId`, `deletedSpaceIds`) — a sixth synthesised path this ticket did not list, which put its diagnostic in `message` the same way.
  - `session-registry.ts`: `coordinated-commit-threw` carrying the thrown value as `cause` (both the preparation throw and the commit throw), and `coordinated-result-malformed` with `omittedSpaceIds` — the requested participants and deletions the answer left out, empty when what broke was a repeated or unrequested entry instead.
  - `@project/http`'s four wire paths: `problem-media-type` (`contentType`), `problem-status-mismatch` (`httpStatus`, `problemStatus`), `malformed-response` (the decoder's thrown value as `cause`) and `unexpected-problem` (`problemCode`, one of the four codes a commit never answers).
  - Tests read each: `session.test.ts` "names the $name protocol fault as typed context", `space-resource-lifecycle.test.ts` "releases the barrier and rejects every participant when the backend throws" and "names the participant a malformed coordinated result omitted", and the HTTP classification tables in `packages/http/test/http-backend.test.ts` and `test/unit/http-space-backend-failures.test.ts`.
- **Departure: "the coordinated persistence read threw" was never a delivered `protocol` failure.** `runSpaceResourceCoordination` installed `persistence-read-failed` and *returned* the protocol failure, and `coordinateSpaceResource` discards that return (`void …`), so the value reached nothing. The coordination now returns what it installed, and the thrown value rides the refusal the caller does receive: `SpaceResourceRefusal`'s `persistence-read-failed` carries an optional `cause`, present when the read threw and absent on the two `plan` paths where the read answered without a Space it needed. The lifecycle tests for create, link and delete read it.
- **Residue, deliberately out of scope:** the two thrown-value paths that answer a *retryable* failure — `session.ts`'s catch on a rejecting `commit` (`unavailable`) and `HttpSpaceBackend`'s network catch (`network`) — lost their `message` with everything else and carry no typed context, because the retryable arm has none. Neither was one of the five paths this ticket named; giving them a `cause` is a separate decision about the retryable arm.

## Acceptance

- [x] `CommitResult`'s `retryable-failure` and `permanent-failure` arms carry no `message`, and nothing in `packages/` or `test/` constructs one.
- [x] `RepositoryCommitResult`'s `rejected.message` is unchanged; the HTTP host still sends `problem.detail`.
- [x] Each of the five synthesised `protocol` paths above keeps its diagnostic — at minimum the offending Space id where it has one — as typed context rather than prose, and a test reads it.
- [x] The persistence copy in `authoring-refusal.ts` and the tests that pin it are unchanged. This is a diagnostic change, not a copy change.
- [x] ADR 0057's status block no longer lists the two residues, and no longer says the work waits on `command-dock/07`.
- [x] `pnpm verify` and `pnpm e2e:ladle` pass. `pnpm e2e` applies too: the failures reach the browser through `@project/http`.
