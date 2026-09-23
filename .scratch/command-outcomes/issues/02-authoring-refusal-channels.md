# 02 — Graph and Reference refusals through command outcomes

Status: resolved
Blocked by: 01

**What to build:** Move the Graph cluster's Authoring-refusal notice onto `graph-edit`, and `createReferenceFrom` onto `reference-create` with its continuation. Map reports belong to tickets 06–09's `MapAuthoringCommands`, which returns their complete title and message for command outcomes to hold. See `../spec.md`.

**Why:** The Graph and Reference Resource call sites each hand-roll narrow → describe → set. Map outcome ownership was sharpened after this ticket was filed and now moves with the complete Map Edit behind one interface.

## Build

- [x] `graphRefusal` and `referenceRefusal` are deleted from App.
- [x] `createReferenceFrom` keeps its offset maths (`Placement.growth`, ADR 0093) and hands the continuation to `continueAt`.
- [x] Their `refusedUnder` lines go; the reset covers them through the table.

## Tests

- [x] `command-outcomes.test.ts` gains the two channels' titles and describers.
- [x] One `Application` test proves a refused Graph edit and Reference Resource creation render and dismiss through command outcomes.

## Done when

- [x] `rg "setGraphRefusal|setReferenceRefusal" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments

**2026-09-23, resolved.** `pnpm verify` green (236 files, 3048 tests). `pnpm e2e` was not run by this ticket's agent — the coordinator runs it for the branch — so the verify/e2e box stays open until it does.

- **`failureMessage` confirmed as both break describers.** Before this ticket neither call site caught a throw: a thrown Graph Edit escaped the Dock's handler, and a thrown Create Reference was caught by `EntityActionsMenu`, logged to `console.error` and shown as the row's `failed`. Now both reach `reportBreak` and publish the failure's own message under the channel's title; `createReferenceFrom` still answers `failed` for `COMMAND_BROKE` as for a refusal.
- **`continueAt` may answer `null`.** Space Authoring's completed result carries `createdResourceId` optionally, and `createReferenceFrom` used to request nothing when it was absent, so `CommandContinuation.continueAt` now returns `PendingContinuation | null`. Ticket 03's `SpaceResourceCreationResult` always names its `resourceId`, so it need not use the `null` arm.
- `reportGraphEdit` became `runGraphEdit(operation)`, which runs the cluster's Recolour and New Graph through `run('graph-edit', …)`. The notices render in `COMMAND_CHANNELS` order, which already put `reference-create` before `space-command` and `graph-edit` after it, as App drew them.
- The `Application` test is in `resource-rail-actions.test.tsx` beside ticket 01's Remove from Map one: it refuses `added-graph` and `created-reference` through a spy on `authoring.complete`, and dismisses each notice separately.
