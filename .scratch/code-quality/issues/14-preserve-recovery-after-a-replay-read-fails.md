# 14: Preserve recovery after a replay read fails

**Priority:** P1 — confirmed recovery blocker

**Status:** resolved

**Blocked by:** None; builds on 04

**Problem:** A coordinated commit fails, the author presses Retry, and the replay's aggregate read also fails. The participants remain failed, but a second Retry does nothing. The user cannot save the coordinated work through the offered recovery action even after the backend becomes available.

**Evidence:** `CoordinatedCommit.#beginRecovery` in `packages/persistence/src/coordinated-commit.ts` moves to `recovered` before `#replay` starts. The callback in `packages/persistence/src/session-registry.ts` discards `coordinate(..., true)`'s result. When `readAggregate` refuses before installation, no new machine takes ownership and no transition makes the old recovery usable again. The subsequent recovery call returns immediately.

The public-interface reproducer fails on both PR 277's implementation and its base `bde05042`, whose `recoveryStarted` flag has the same behavior. This is inherited, not a regression introduced by the extraction.

**Reproduce:** In the lifecycle test fixture, queue a `retryable-failure`, create a Space Resource, and wait for its Meta session to become failed and the coordination turn to end. Mock `backend.loadAggregate` to reject once. Call `meta.retry()` and await `registry.waitUntilRetirable(META_ID)`. Call Retry and await the turn again. The aggregate spy has one call rather than two; no second commit is attempted. Use `MemorySpaceBackendTestControl`, deferred promises or the registry barrier, not sleeps.

**What to build:** Make recovery ownership account for a replay that fails before installation. A pending replay must still suppress duplicate user requests, but a read refusal or throw must leave an explicit usable recovery path. Preserve the existing coordinated participant set and newer local work. Do not mark the operation settled when it never committed.

- [x] A regression through the registry fails before the fix: failed commit → failed replay read → restored backend → another Retry → all participants settle together
- [x] The equivalent keep-local path remains recoverable when its pre-installation read fails
- [x] Duplicate recovery presses while one replay is pending produce one replay, not duplicate commits
- [x] The original participant recovery is replaced only when another attempt has taken ownership, or is restored on pre-installation failure
- [x] A thrown replay preparation/plan failure is handled without an unhandled rejection or stranded barrier
- [x] Latest authored snapshots and provisional-create semantics survive the retry sequence
- [x] Persistence tests and affected application recovery tests pass

## Answer

`CoordinatedCommit` now has a `recovering` phase between a recovery request and `recovered`. Retry and Keep local move the commit to `recovering`, remember the phase they began from, and ask the registry for a replay naming this commit as its `predecessor`. The replay's own `CoordinatedCommit` takes recovery over once `prepare` has made every participant `coordinating` (`#handOver`, `recovering → recovered`), so a replay that enlists and then throws part-way through `prepare` has not taken over. `runCoordination` calls `predecessor.resumeRecovery()` in its `finally`, before the turn finishes. That call does nothing once the replay has taken over; otherwise it returns the commit to `failed`, `conflicted` or `unwound`, so the participants' existing recovery works again. Requests made while `recovering` are still ignored, and Accept stored still goes straight to `recovered`. The registry's replay handler now catches the replay's rejection, so a replay that throws before installing no longer causes an unhandled rejection.

Regression tests are in the `Space Resource recovery after a replay that never installed` block of `packages/persistence/test/space-resource-lifecycle.test.ts`. The Retry test, the Keep-local test and the thrown-replay test fail on the parent commit (the thrown one also with an unhandled `has no live session` rejection) and pass after the fix. The duplicate-press test already passed before the fix and guards that the fix did not loosen it. The direct seam tests are in `packages/persistence/test/coordinated-commit.test.ts`.

**Notes:**

- A Keep-local replay that re-creates a Space deleted remotely marks it uncommitted before the replay reads. If that read fails, the mark stays. That is harmless, because the next Keep local marks it again, and retiring or evicting the session clears it.
- Of the affected application tests, `active-graph-after-coordinated-recovery`, `coordinated-context-create` and `coordinated-context-delete` pass. Two application tests that do not use coordinated recovery also fail on the untouched parent tree on this loaded machine: `space-resource-embedded-map.test.tsx` and one `open-spaces.test.tsx` case, which timed out.
