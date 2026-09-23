# 05 — Graph delete messages through command outcomes

Status: ready-for-agent
Blocked by: 02, 03, 04

**What to build:** Delete Graph runs `coordinatedGraphDelete` through `run('graph-delete', …)`, whose describer is the helper's error message. The navigation after a completed delete stays in the caller. Map deletion belongs to ticket 08's `MapAuthoringCommands`, and ticket 09 removes its old paths and the last render-time reset. See `../spec.md`.

**Why:** Graph deletion still carries its own loose notice slot. Map deletion moved into the deeper Map authoring module after this ticket was filed.

## Build

- [ ] `graphDeleteMessage` is deleted from App.
- [ ] Graph coordination remains in its existing helper; ticket 08 owns the separate Map deletion deepening.
- [ ] Every shell notice App draws, except "Link not copied" and the destination-not-found report, reads from the module's state.

## Tests

- [ ] `command-outcomes.test.ts`: the Graph delete channel and a Map change clearing it.
- [ ] `graph-delete-notice.test.tsx` keeps its assertions unchanged.

## Done when

- [ ] `rg "setGraphDeleteMessage" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments
