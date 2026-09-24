# 16: Prove partial coordinated preparation and settlement

**Priority:** P2 — verification gap, not a confirmed production defect

**Status:** resolved

**Blocked by:** None; use the machine introduced by 04 and coordinate with 14

**Problem:** Ticket 02 explicitly leaves participant preparation failure untested because the registry barrier makes it unreachable through the public lifecycle. PR 277 introduces a direct `CoordinatedCommit` seam, but its unwind test prepares and publishes one participant successfully and then calls `unwind`. It does not prove cleanup after the second of several participants throws during preparation.

**Evidence:** `packages/persistence/src/coordinated-commit.ts` appends a participant to `#begun` only after preparation returns. `unwind` fails that prefix and drops provisional creates. Those are observable cleanup obligations, not merely phase names. The direct tests in `packages/persistence/test/coordinated-commit.test.ts` can now exercise them with real managed sessions plus a narrow throwing collaborator.

**What to build:** Focused behavioral tests of the exception and protocol boundaries. Reuse existing registry tests for paths they already prove; do not enumerate the transition table mechanically or construct a second model that repeats the implementation.

- [x] At least two participants are used; preparation of a later participant throws after an earlier one has begun
- [x] Unwind leaves every begun participant out of pending/coordinating, removes provisional entries, and provides the intended recovery
- [x] Participants whose preparation never began retain their previous working/persistence state until a subsequent authorized recovery changes them
- [x] A malformed committed result never partially acknowledges or evicts participants; cover the meaningful omitted, unexpected or duplicate identity cases not already proved through the registry
- [x] Observations include session state, provisional/session ownership and actual replay requests, not only `phase`
- [x] An illegal public transition produces no participant mutation
- [x] Persistence tests pass, including ticket 02's characterization tests

Do not add a production failure-injection mode solely to reach these cases. If a collaborator failure cannot occur in the shipped implementation, record that scope; do not report it as an observed application bug.

## Answer

The tests are the `CoordinatedCommit preparation, settlement and illegal moves` block in `packages/persistence/test/coordinated-commit.test.ts`. They use real managed sessions over `MemorySpaceBackend` and a `CoordinationSpaces` that records provisional entries, uncommitted creates and evictions. No production code changed, and none of the tests found a defect.

- **Partial preparation.** The Edit has three participants: a created Space, Meta and a second stored Space. Meta already has an ordinary commit in flight, so preparing it throws after the created Space has begun. After `unwind`, the created Space is idle and rejected with `coordinated-commit-threw`, and its provisional entry is gone. Meta keeps its own commit and working Space, and that commit then settles normally. The unreached participant's state object is unchanged. Neither untouched participant was handed the commit's recovery: Retry on Meta and a new Edit on the other Space replay nothing. The begun participant's recovery replays the whole Edit exactly once. The test fails if `unwind` fails every participant instead of only the ones that began.
- **Malformed settlement.** Six shapes are covered: an unrequested revision, a duplicated revision, a duplicated deletion, an omitted deletion, a deletion answered as a revision, and a revision answered as a deletion. For each, no participant is acknowledged and none is evicted. The created Space stays uncommitted and loses its provisional entry. Every participant is rejected with `coordinated-result-malformed`, naming the expected omitted ids, and one recovery replays the original change set. The omitted-update case is already covered through the registry by `names the participant a malformed coordinated result omitted`.
- **Illegal public moves.** `settle` in the wrong phase (committed, conflict and failure answers), a second `prepare`, `unwind` after settlement, and `resumeRecovery` outside `recovering` each throw. None of them changes the phase, any participant's state object, or the recorded holdings.

**Scope:** In the shipped registry, a participant's preparation cannot throw, because the barrier pauses every session and `waitForIdle` runs before `prepare` (ticket 02). So this is proved at the `CoordinatedCommit` seam rather than through the registry, and no failure-injection mode was added. The persistence tests pass, including ticket 02's characterization tests.
