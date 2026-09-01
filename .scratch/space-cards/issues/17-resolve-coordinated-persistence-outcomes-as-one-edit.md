# 17 — Resolve coordinated persistence outcomes as one Edit

**What to build:** Give every participant in a coordinated Space Card Edit one
shared persistence outcome and one recovery operation.

**Blocked by:** 16 — Make Space Card lifecycle the one multi-Space Edit
interface.

**Status:** resolved
Tags: release/v1

- [x] A committed result acknowledges every changed or created participant and
      evicts every deleted session only after the atomic repository answer.
      Missing, duplicate or contradictory per-Space results are protocol
      rejection, never a partially accepted success.
- [x] A retryable failure marks every participant `failed`; one Retry submits
      the newest local state of the complete coordinated Edit, including later
      ordinary Edits queued behind it.
- [x] A conflict marks every participant `conflicted` while retaining the
      authoritative remote value that caused it. Keep local and Accept stored
      resolve all participants together, never one Space at a time.
- [x] A permanent rejection marks every participant `rejected` and preserves
      their newest local working state, matching the existing rule that later
      valid Authoring may attempt it again.
- [x] A thrown backend call, observer failure or malformed result always
      releases the browser persistence barrier and leaves every participant in
      an explicit recoverable or rejected state; no session remains permanently
      coordinating.
- [x] Tests prove shared committed, retryable, conflicted, rejected and thrown
      outcomes, including later ordinary Edits, participant switching and one
      recovery action for the complete atomic Edit.
- [x] Update `docs/agents/editing-and-persistence.md` and the `space-cards/03`
      answer to describe ADR 0076's domain-shaped interface and remove the old
      snapshot-submit contract once the cutover is complete.

## Not in scope

Semantic or field-level merge, background synchronisation between tabs, new
conflict UI treatment, or changing the per-Space export revision model.

## Answer

Every coordinated participant now receives one checked repository outcome.
Complete success acknowledges or evicts the whole set; incomplete,
contradictory or thrown answers become an explicit shared failure rather than a
partial install. Retry uses the newest local states, conflict recovery keeps or
accepts the whole Edit together, permanent rejection preserves later valid
authoring, and every path releases the persistence barrier.
