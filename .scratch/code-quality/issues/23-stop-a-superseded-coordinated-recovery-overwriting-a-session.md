# 23: Stop a superseded coordinated recovery overwriting a session

**What to build:** A coordinated recovery must act only on participants it still owns. Today a session can leave one coordinated commit's `conflicted` state through a *different* coordination, keep a pointer to the first commit's recovery, start an ordinary commit, and then have another participant's **Accept stored** run that old recovery over it. `restoreCoordinatedCommit` installs `settled` and the old conflict's stored snapshot while the session's commit is in flight. The local Edit disappears from `working`, and when the in-flight commit lands, the session shows content that differs from what it just stored at that revision. The next Edit is then built on the wrong base.

This breaks the stronger invariant "`inFlight` implies `pending`". The narrower invariant from `mutation-testing/05`, "`inFlight` is never `failed` or `conflicted`", still holds, because neither `restoreCoordinatedCommit` nor `completeCoordinatedDeletion` installs those states.

**Blocked by:** None. Related to 14, which covers the same recovery-ownership area but a different defect.

**Status:** resolved

**Reproduced:** yes, on #277's head (`acc1604a`, `cq-registry`) and on `origin/main` (`bde05042`). The same test fails in the same way on both, so the defect was **inherited, not introduced by #277**.

## Sequence

All steps go through `createSpaceSessionRegistry`, `spaceResources().create` and `SpaceSession`, with `MemorySpaceBackendTestControl` queued results and one `deferNextCommit`. The test uses no sleeps and reads no private state.

1. **C0:** create a Space Resource for TARGET in Meta. The backend answers `permanent-failure`. Meta and TARGET become `rejected`, and both hold C0's recovery.
2. **C1:** create a Space Resource for CHILD in TARGET. Nothing refuses this, because `recoveryNeeded()` counts only `failed` and `conflicted`, and create checks only the containing Space. The backend answers `conflict` naming TARGET. TARGET and CHILD become `conflicted`, and both hold C1's recovery, which stays in phase `conflicted`.
3. An Edit on Meta (`meta.submit`) replays C0 through Meta's C0 recovery. `planReplay` has no recovery check, so the replay re-enlists TARGET even though TARGET is `conflicted` under C1. The replay commits. `acknowledgeCoordinatedCommit` settles TARGET and **does not clear its `coordinatedRecovery`**, so TARGET still points at C1. CHILD stays `conflicted` on C1.
4. `target.submit(localEdit)` starts an ordinary commit, which is held in flight. TARGET is `pending`.
5. `child.acceptRemote()` runs C1's recovery (`#recoverByAcceptingRemote`). That recovery calls `restoreCoordinatedCommit` on TARGET, and nothing checks `inFlight`.

**Expected** after step 5: TARGET is still `pending`, with `working` = the local Edit. C1's recovery either refuses to act on a participant it no longer owns or was never reachable. **Observed:** TARGET is `settled` with `working` = C1's stored conflict snapshot ("Stored elsewhere") and `acknowledgedRevision` 9n, and CHILD is evicted. After the held commit is released and acknowledged at revision 1n, TARGET stays `settled` at 1n showing "Stored elsewhere", while revision 1n actually stored "Local edit in flight".

Several gaps combine to cause this. Any one of them may be the right place to cut it, and the fix should say which one it cuts:

- a replay enlists participants without checking whether they are held by another live recovery
- `acknowledgeCoordinatedCommit` leaves a stale `coordinatedRecovery` in place
- `rejected`/`refused` participants holding a recovery are not counted by `recoveryNeeded()`, so a second coordination can take them
- `restoreCoordinatedCommit`/`completeCoordinatedDeletion` do not check `inFlight`

Step 4 is not needed to show the defect. Without it, step 5 still rolls TARGET back from the revision the replay just acknowledged (0n) to C1's stale 9n, along with its content. The in-flight case is the worst form of it.

## Reproducer

Paste this into `packages/persistence/test/space-resource-lifecycle.test.ts`, which already provides `META_*`, `TARGET_*`, `CHILD_*`, `SPACE_RESOURCE_ID`, `SECOND_SPACE_RESOURCE_ID`, `metaSnapshot` and `idSource`. It fails at the first `pending` assertion on both `acc1604a` and `bde05042`.

```ts
it('does not let a superseded recovery settle a session over its in-flight commit', async () => {
  const control = new MemorySpaceBackendTestControl();
  const backend = new MemorySpaceBackend(
    META_ID,
    [{ snapshot: metaSnapshot, revision: 3n, exportedRevision: null }],
    control,
  );
  const registry = createSpaceSessionRegistry(backend);
  const meta = registry.open({ snapshot: metaSnapshot, revision: 3n, exportedRevision: null });
  const lifecycle = registry.spaceResources(
    idSource([
      TARGET_ID, TARGET_RESOURCE_ID, TARGET_MAP_ID, TARGET_GRAPH_ID, SPACE_RESOURCE_ID,
      CHILD_ID, CHILD_RESOURCE_ID, CHILD_MAP_ID, CHILD_GRAPH_ID, SECOND_SPACE_RESOURCE_ID,
    ]),
  );

  // C0 rejected: Meta and TARGET hold C0's recovery.
  control.queueResult({ kind: 'permanent-failure', code: 'forbidden' });
  await lifecycle.create({
    containingSpaceId: META_ID, mapId: META_MAP_ID, title: 'Target', position: { x: 0, y: 0 },
  });
  await vi.waitFor(() => expect(meta.getState().persistence.kind).toBe('rejected'));
  const target = registry.session(TARGET_ID);
  if (target === undefined) throw new Error('target session was not installed');

  // C1 conflicted: TARGET and CHILD hold C1's recovery.
  const storedTarget: SpaceSnapshot = {
    ...target.getState().working,
    document: { ...target.getState().working.document, title: 'Stored elsewhere' },
  };
  control.queueResult({
    kind: 'conflict',
    conflicts: [
      { spaceId: TARGET_ID, current: { snapshot: storedTarget, revision: 9n, exportedRevision: null } },
    ],
  });
  await lifecycle.create({
    containingSpaceId: TARGET_ID, mapId: TARGET_MAP_ID, title: 'Child', position: { x: 300, y: 0 },
  });
  await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('conflicted'));
  const child = registry.session(CHILD_ID);
  if (child === undefined) throw new Error('child session was not installed');

  // Replaying C0 settles TARGET outside C1's recovery.
  control.queueResult({
    kind: 'committed',
    revisions: [{ spaceId: META_ID, revision: 4n }, { spaceId: TARGET_ID, revision: 0n }],
    deletedSpaceIds: [],
  });
  meta.submit(meta.getState().working);
  await vi.waitFor(() => expect(target.getState().persistence.kind).toBe('settled'));
  expect(child.getState().persistence.kind).toBe('conflicted');

  // An ordinary commit in flight on TARGET.
  const releaseCommit = control.deferNextCommit();
  target.submit({
    ...target.getState().working,
    document: { ...target.getState().working.document, title: 'Local edit in flight' },
  });
  expect(target.getState().persistence.kind).toBe('pending');

  child.acceptRemote(); // runs C1's stale recovery

  expect(target.getState().persistence.kind).toBe('pending'); // observed: 'settled'
  expect(target.getState().working.document.title).toBe('Local edit in flight'); // observed: 'Stored elsewhere'
  releaseCommit();
});
```

## Decision

Two gaps are cut, both at the cause. The other two are left, for the reasons given.

**Cut: a replay takes participants another recovery holds.** `planReplay` now takes the set of participants that still hold the predecessor's recovery (`CoordinatedCommit.recoveryHolders`, read through the new `ManagedSpaceSession.holdsCoordinatedRecovery`). Any other participant that needs recovery (`failed` or `conflicted`, as `recoveryNeeded()` counts) belongs to another coordination's recovery, so the replay refuses with `persistence-recovery-required`, naming it. This is ADR 0076's existing rule that an affected Space in `failed` or `conflicted` must recover before an operation begins. Until now a replay was the one operation that skipped it. The refused replay ends before it enlists, so the predecessor resumes its phase and can be asked again. In the sequence, step 3 is refused: nothing reaches the backend, Meta stays `rejected`, and TARGET and CHILD stay `conflicted` under C1. The superseded state never arises.

**Cut: acknowledgement leaves a stale recovery pointer.** `acknowledgeCoordinatedCommit` and `completeCoordinatedDeletion` now clear `coordinatedRecovery`, as `restoreCoordinatedCommit` already did. So a session holds a recovery only while it is in the outcome that recovery installed, and `recoveryHolders` reads ownership exactly. Without this, a participant that a later coordination took from `rejected` and acknowledged kept pointing at the old commit, and its next Edit after an unrelated ordinary rejection replayed that commit instead of committing on its own.

**Left: `rejected`/`refused` participants are not counted by `recoveryNeeded()`.** ADR 0076 deliberately lets a `rejected` Space take part in a later Edit ("a later valid Edit is already allowed to attempt its newest local state"), and `refuseBeforeLinking` and ADR 0099 depend on that. Counting them would reverse an accepted decision to close a hole the replay check already closes. With the replay check in place, C1 may still take TARGET from C0, but C0 can no longer replay over TARGET while C1's recovery holds it.

**Left: `restoreCoordinatedCommit`/`completeCoordinatedDeletion` do not check `inFlight`.** After the two cuts nothing can reach that check. A recovery that restores or completes participants is always in `conflicted`, and `#conflict` gives every participant that recovery. A participant that holds a recovery starts no commit of its own: `submit` and `resolveConflict` route to the recovery, and `retry` answers only `failed`. No new coordination can take it (`recoveryNeeded`), and after this fix no other replay can either. A guard that no test can reach is a claim that no test holds, so the invariant is written at `let inFlight` and held by a test instead.

**What happens to CHILD:** C1 is not refused (see the third point). After the fix, CHILD's Accept stored resolves C1 for its whole participant set, as ADR 0076 requires. TARGET takes the Space that C1's conflict answered ("Stored elsewhere", 9n) and settles. CHILD was never stored and has no baseline, so it leaves the registry. Its Keep local, which replays C1 over TARGET and CHILD and which the replay check allows because both hold C1, is the other working exit.

## Acceptance

- [x] The reproducer is added as regression tests in `space-resource-lifecycle.test.ts` (`Space Resource recovery another coordination holds`) and was red before the fix. Because the fix refuses step 3, the verbatim reproducer (which waits for step 3 to settle TARGET) cannot pass after it. It is split instead: "does not replay a coordination over a participant another conflicted coordination holds" asserts the refusal at step 3, and "does not let a superseded recovery settle a session over its in-flight commit" resolves C1, lets C0's replay land, holds an ordinary TARGET commit in flight, and runs both stale Accept stored handles. TARGET stays `pending` with the local Edit. Once the held commit is acknowledged, TARGET's `working` is the snapshot that revision's request stored.
- [x] "does not let a superseded recovery roll a participant back from a revision a later commit acknowledged" is the version without step 4. After C0's replay acknowledges TARGET at 10n, neither CHILD's nor TARGET's Accept stored changes TARGET's state.
- [x] CHILD: "resolves CHILD and TARGET together through CHILD's Accept stored" asserts the outcome stated above. CHILD is never left `conflicted` with no exit.
- [x] The invariant holds after the fix and is written on `let inFlight` in `session.ts`, naming the in-flight test. The stale pointer cut is held by "answers an Edit after an ordinary rejection with its own commit once a later coordination acknowledged the Space". Reverting either cut turns its tests red.
- [x] `pnpm exec vitest run packages/persistence/test` passes. `pnpm verify` is left to CI.
