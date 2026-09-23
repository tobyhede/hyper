# 05 — Graph delete messages through command outcomes

Status: resolved
Blocked by: 02, 03, 04

**What to build:** Delete Graph runs `coordinatedGraphDelete` through `run('graph-delete', …)`, whose describer is the helper's error message. The navigation after a completed delete stays in the caller. Map deletion belongs to ticket 08's `MapAuthoringCommands`, and ticket 09 removes its old paths and the last render-time reset. See `../spec.md`.

**Why:** Graph deletion still carries its own loose notice slot. Map deletion moved into the deeper Map authoring module after this ticket was filed.

## Build

- [x] `graphDeleteMessage` is deleted from App.
- [x] Graph coordination remains in its existing helper; ticket 08 owns the separate Map deletion deepening.
- [ ] Every shell notice App draws, except "Link not copied" and the destination-not-found report, reads from the module's state.

## Tests

- [x] `command-outcomes.test.ts`: the Graph delete channel and a Map change clearing it.
- [x] `graph-delete-notice.test.tsx` keeps its assertions unchanged.

## Done when

- [x] `rg "setGraphDeleteMessage" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments

**2026-09-23, resolved.** `pnpm verify` green (236 files, 3057 tests). `pnpm e2e` was not run by this ticket's agent — the coordinator runs it for the branch — so the verify/e2e box stays open until it does.

- **The Dock's Delete Graph is one `commandOutcomes.run('graph-delete', () => coordinatedGraphDelete(spaceResources.deleteGraph, …))`**, and the caller keeps `navigation.activateGraph(result.graphId)` for a `completed` result in the returned promise's `then`. The helper already answers a promise, so the thunk needs no `async`: its own `async` body turns any throw into a rejection. `graphDeleteMessage`, its `ShellNotice` and its line in `refusedUnder` are gone; the module had already declared the command, its `result.message` describer and a `failureMessage` break, so it changed only by a comment.
- **A throw is now said and reported.** Before, a rejected `coordinatedGraphDelete` escaped the `void` IIFE as an unhandled rejection; it now reaches `reportBreak` and publishes the failure's message under "Graph not deleted".
- **Staleness now applies**, and the navigation follow-up does not consult it: a delete pressed on one Map that settles under another draws no notice, but a `completed` result still activates its Graph, as before. Ticket 08 decides the matching rule for Map deletion.
- **The "every shell notice" box stays open on purpose.** "Map not created"/"Map unchanged" and "Map not deleted" are still drawn by App from `createMapRefusal`, `mapManagementRefusal` and `mapDeleteMessage` until tickets 06–08 move them behind `MapAuthoringCommands`, and ticket 09 removes `refusedUnder`, which now resets only those three.
- Tests: `command-outcomes.test.ts` gains a `graph-delete` block — the helper's message under its title, `completed`/`unchanged` clearing the channel and answering the caller, a Map change clearing it, a delete settling under another Map dropped, and a thrown delete reported and said in its own words. `graph-delete-notice.test.tsx` is unchanged and green, as is `coordinated-context-delete.test.ts`'s source scan of the wiring.
