# 35 — `internal-error` reaches the author exactly as `persistence-unavailable` does, and fixing that is a design question

**What to build:** Nothing yet — this records an open design question surfaced while narrowing a comment that overclaimed a client behaviour. Decide whether a commit that failed because of broken stored state (`internal-error`) should surface to the author differently from an ordinary transient failure, and if so, how.

**Blocked by:** Nothing.

**Status:** ready-for-human

**Tags:** Question

**Why:** PR #243 review (P1) found that the commit route's `internal-error` arm (`packages/http/src/index.ts`, landed when ticket 24's `SqlSpaceRepository.commit` gained the same `AggregateInvariantError` its aggregate read already raised) carried a comment claiming the 500-vs-503 split exists so a defect no retry cures isn't "503 `persistence-unavailable` forever retried by a client that cannot fix it." That is not what the client does.

Traced end to end: `commitFailureForProblem` (`packages/http/src/backend.ts:200`, as of the 2026-10-09 triage) maps both `'persistence-unavailable'` and `'internal-error'` to the identical `{ kind: 'retryable-failure', code: 'unavailable' }` `CommitResult` — pinned verbatim by `packages/http/test/http-backend.test.ts`'s `'maps %s to retryable %s'` cases, which include `['internal-error', 'unavailable']`. A `retryable-failure` becomes `SpaceSessionState.persistence.kind === 'failed'` (`packages/persistence/src/session.ts:317-320`), which `PersistenceNotice` (`packages/app/src/components/PersistenceControl.tsx:177-207`, rendered whenever `canRetry` holds, `session.ts:117-121`) renders as a non-blocking alert carrying an explicit **Retry** button (`data-testid="persistence-retry"`, `onClick={onRetry}` → `session.retry()`, `session.ts:432-441`) that reissues the identical commit against the same broken store. So today a defect no retry cures is in fact offered to the author as something to retry, on a loop — the opposite of what the comment claimed the split prevented. The comment was narrowed, in the same commit that filed this ticket, to describe only what the 500-vs-503 split actually does: an operator-facing status/log distinction, not a client behaviour change.

Giving `internal-error` its own permanent-failure classification is not a small follow-on of moving a `switch` arm, which is why this is a ticket and not just the comment fix. `CommitResult`'s `permanent-failure` kind (`packages/persistence/src/backend.ts:104-119`) has four codes — `invalid-commit`, `forbidden`, `payload-too-large`, and `protocol`, which carries a `ProtocolFault` — and none describes "the store holds data this deployment cannot read back," which is not something the author's own edit caused or can fix by editing differently. Reusing one would misdescribe the failure (`protocol` reads as a format disagreement; `invalid-commit` reads as "you sent something wrong"). Worse, the existing `rejected` UI (`RejectionControl`, an `AlertDialog` at `packages/app/src/components/PersistenceControl.tsx:372-405`) says "The server rejected these changes. Continue editing to correct the problem" — wrong for a stored-state defect, which editing cannot correct. And `SpaceSession.submit` (`session.ts:413-431`) auto-resubmits on the very next edit once a session is `rejected` or `refused` (unlike `failed`, which requires an explicit `retry()` and does not resubmit on further edits) — so mapping `internal-error` into the existing `rejected` shape as-is would silently hammer the broken store on every keystroke rather than stopping, which is worse than what ships today.

## What to decide

- [ ] Does a broken-stored-state commit failure deserve a distinct `CommitResult`/`SpaceSessionState.persistence` identity from an ordinary rejection, or is "retryable, but the author should eventually stop clicking Retry and tell someone" an acceptable permanent state for V1?
- [ ] If it gets its own identity: what code, what message copy (not "continue editing to correct the problem"), does it still offer Retry at all (a later attempt might succeed if the specific broken row was fixed by an operator meanwhile, unlike a genuinely invalid commit, which never will), and does `submit()`'s auto-resubmit-on-edit behaviour apply to it or not?
- [ ] Since ticket 38, `internal-error` also answers every **unclassified** stored-seam failure, not only broken stored state: `packages/http/src/index.ts:143-149` maps `broken-stored-state` to "Stored repository state is not usable." and `unclassified` — a PostgreSQL wrong password (`28P01`), refused authorization (`28000`) or missing database (`3D000`) among them — to "The request failed unexpectedly." Both reach the browser as the same problem type. Decide whether the client treatment covers both, and whether the two need telling apart on the wire to do so.
- [ ] Account for the session states added since filing: `refused` (an aggregate refusal, `session.ts:43-53`) shares `rejected`'s recovery, and a `rejected` for `payload-too-large` offers Retry (`canRetry`, `session.ts:117-121`). Any new identity has to say where it sits beside those.
- [ ] Whether this is worth building for V1 at all — ADR 0095/ticket 27 both treat broken stored state as a deployment defect, not a case an author is expected to hit in the course of ordinary use.

## Provenance

PR #243 review (P1), 2026-09-20.

**Not folded into ticket 31.** Ticket 31 is entirely the server-side classification of `AggregateInvariantError`-vs-transient across `space-host.ts`'s two call sites, `packages/http/src/index.ts`'s GET and POST readers, and `database-startup.ts`'s retry loop — all producers or namers of the 500-vs-503 split, none of them `backend.ts`, `session.ts` or `PersistenceControl.tsx`. This ticket starts downstream of that split, once it has already reached the browser as a decided HTTP status: the `CommitResult` mapping and the `SpaceSession`/`PersistenceControl` UI that consume it. Ticket 31's checklist does not name any of the three files this one turns on.

## Comments

**Audit, 2026-09-21.** The trace above still holds against `d456b00c`; `http-backend.test.ts:115` still pins `['internal-error', 'unavailable']`.

**Scope note.** Ticket 31 settled the fast-path case: `#loadStoredSpaceRowForCommit` names a stored document that fails its schema on the single-Space fast path broken stored state (`AggregateInvariantError`), so the server answers it 500 `internal-error` like the complete-aggregate commit path and unusable stored revisions (pinned in `test/support/repository-contract.ts`, "names a broken stored document broken stored state on the single-Space fast path"). This question therefore covers every broken-stored-state commit — and, since ticket 38, every unclassified one too (see "What to decide").

### Triage, 2026-10-09

> *This was generated by AI during triage.*

**Category:** enhancement. **State:** ready-for-human.

The trace still holds: `packages/http/src/backend.ts:211-212` maps both `persistence-unavailable` and `internal-error` to retryable `unavailable`, which `packages/http/test/http-backend.test.ts:115` pins, and the source points at this ticket (`packages/http/src/index.ts:515-517`). The body's line refs are refreshed across `backend.ts`, `session.ts` and `PersistenceControl.tsx`, and it now names the `refused` state, the Retry on a `payload-too-large` rejection, and `RejectionControl` becoming an `AlertDialog`. The question is widened, because since ticket 38 `internal-error` also answers unclassified failures such as database misconfiguration (`index.ts:148-149`). The open decision is a product one: whether such failures get their own client identity, with what copy, and whether Retry and resubmit-on-edit apply to them.
