# 15 — Derive coordinated Edits behind a browser persistence barrier

**What to build:** Replace stale caller-built coordinated snapshots with the
private persistence barrier and latest-state derivation required by ADR 0076.

**Blocked by:** `space-cards/03`'s aggregate backend and per-Space session
foundation.

**Status:** resolved
Tags: release/v1

- [x] Reproduce the reviewed data-loss case first: an ordinary commit is in
      flight, coordination waits, another ordinary Edit commits, and the
      coordinated path currently installs the snapshot captured before both.
- [x] Add one browser-wide barrier that prevents any new backend commit from
      starting while a Space Card lifecycle operation coordinates. Authoring
      remains enabled and completed later Edits become authoritative queued
      work.
- [x] Wait for commits already in flight before deriving the coordinated Edit.
      Read every affected Space from its latest authoritative working session,
      never from a snapshot supplied before the wait.
- [x] Keep the barrier until the coordinated repository answer settles so an
      ordinary commit cannot overtake the topology Edit.
- [x] Commit only the Spaces the lifecycle operation creates, changes or
      deletes, with their independent expected revisions. Do not add an
      aggregate revision.
- [x] An affected `failed` or `conflicted` Space refuses coordination and names
      its existing recovery. A permanently `rejected` Space may participate in
      a later valid Edit.
- [x] Deterministic interleaving tests prove ordinary Edits before the barrier,
      while it waits, and while the backend request is in flight are each
      preserved exactly once and in order.

## Not in scope

The public Space Card lifecycle cutover, shared multi-Space recovery UI, an
aggregate client session, aggregate optimistic revision, or a generic command
or transaction interface.

## Answer

The session registry now owns one private browser-wide persistence barrier. A
Space Card lifecycle operation waits for existing commits, derives its complete
change from the latest working sessions, and holds the barrier through the
atomic repository answer. Ordinary Edits completed while it waits or persists
remain queued against those authoritative sessions and are committed once, in
order, after coordination releases them.
