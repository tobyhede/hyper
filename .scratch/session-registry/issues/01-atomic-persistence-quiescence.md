# 01 — Wait for persistence on the registry, not after it

Status: ready-for-agent

Blocked by: nothing.

Surfaced by: CodeRabbit on PR 215 (“Make the quiescence check atomic”), against
`waitForPersistence` in `packages/app/src/open-spaces.ts`. The helper itself
landed on main in `8dfebbb5` (PR 220). It is **not** a regression of the Dock /
Space Thing menu work; that PR’s create-before-refer tests still pass because
they wait on the Space that just committed. The hole is idle + the `await` gap
+ another coordination taking a turn.

Related: `architecture-review/14` (Open Spaces owns the registry);
`architecture-review/16` (coordination tests live beside the registry);
`diagram-graph-orchestration/04` (create-before-refer spends
`waitForPersistence`); ADR 0076.

## The problem

`waitForPersistence` is two steps:

```ts
await registry.waitUntilRetirable(spaceId);
return registry.session(spaceId)?.getState().persistence.kind === 'settled';
```

`waitUntilRetirable` resolving and then acting cannot be two steps. The
registry already says so on `release`: a coordination takes its turn in the
microtask between them (`coordinationTurns += 1` is synchronous in
`runSpaceThingCoordination`, *before* `await previous`), and
`persistence.kind` alone reports `settled` for a paused session and for queued
work the barrier is holding. That is why `waitUntilRetirable` exists, and why
`retireOpenSpace` retries `waitUntilRetirable` → inspect → `release` until
`release` returns true.

`waitForPersistence` does the wait, then reads `persistence.kind` with no
re-check that the Space is still retirable. A coordination that starts in that
gap leaves the helper returning `true` while a commit is still in flight.

The create-then-refer path does not catch this. It waits on the Space whose
own commit is already pending, so `waitUntilRetirable` actually waits. The
missed case is an **idle** Space (often the other participant) whose wait
resolves immediately, then a coordination claims a turn before the `kind`
read.

## What to build

Give `SpaceSessionRegistry` one method that owns wait, the lost-race retry, and
the settled read. `OpenSpaces.waitForPersistence` becomes a one-line caller.
Do not change `waitUntilRetirable`. Do not change `retireOpenSpace`. Do not
invent a generation token — `release` already closed this window with a
synchronous re-check and a retry, and that is the pattern to copy.

The new method returns `boolean`, matching `waitForPersistence` today:

1. `await waitUntilRetirable(spaceId)`.
2. **Synchronously**, if a coordination now holds a turn, the session is not
   idle, or it has queued work — go back to 1. This is the `release === false`
   case, as a read.
3. Otherwise return whether `persistence.kind === 'settled'` (missing session
   is `false`). A failed, conflicted or rejected Space that is retirable
   returns `false` rather than looping; the loop is only for the gap, not
   until settled.

Name it on the registry. `waitForPersistence` on Open Spaces stays the
application name (`packages/app/src/open-spaces.ts` documents it as “Wait for
queued and in-flight writes before another Space refers to their result”).

## Out of scope

- Dock, Thing rail, entity menus, and any other PR 215 surface.
- Changing `waitUntilRetirable`’s contract or `release`.
- Create-before-refer ordering; that already holds on the Space that committed.
- A token / generation passed across the `await`. The rejected alternative is
  that `waitUntilRetirable` would return a capability the caller has to spend
  correctly. `release` exists specifically so callers do not.

## Acceptance

- [ ] `SpaceSessionRegistry` exposes the wait-and-read. The
      `Object.keys(registry)` list in
      `packages/persistence/test/session-registry.test.ts` names it.
- [ ] A persistence test reproduces the gap: an idle live session,
      `waitUntilRetirable` already able to resolve, then a
      `spaceThings.create` (or `link`) held by
      `MemorySpaceBackendTestControl.deferNextCommit`. The new method must
      **not** resolve `true` while that commit is in flight; after release it
      may. Mirror the existing “refuses to release a session a queued
      coordination has not yet claimed” setup — same window, read rather than
      retire.
- [ ] `packages/app/test/open-spaces.test.ts` covers the same window through
      `waitForPersistence` on an idle *other* Space while a Meta create is
      deferred. Same oracle: not `true` mid-flight.
- [ ] `waitForPersistence` in `open-spaces.ts` is a thin call. Call sites in
      `space-thing-context-commands.ts` (`settled`, `selectAndSave`,
      `waitUntilPersisted`) stay as they are.
- [ ] `pnpm verify` on the finished state. No `e2e` / `e2e:ladle` unless the
      change grows a surface, which it must not.

## Comments

Investigated on `fix/space-thing-mini-dock` (PR 215) and left unfixed there:
the Dock/menu PR is the wrong owner, and `retireOpenSpace` already proves the
retry. A probe in `open-spaces.test.ts` (idle `OTHER_ID`, then deferred
`spaceThings.create`) resolved `true` while `control.requests` still held the
commit; that probe was reverted rather than landed as a red test on this
branch.
