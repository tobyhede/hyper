# 03 — Space Resource creation through command outcomes

Status: resolved
Blocked by: 01

**What to build:** `createSpaceResource` (`App.tsx:507-554`) runs `spaceResources.create` through `run('space-resource-create', …, { continueAt })`. The module owns the refusal sentence (`describeSpaceResourceRefusal`), the break sentence (`describeSpaceResourceCreationBreak`) and the rename continuation at the minted `resourceId`. See `../spec.md`.

**Why:** It is the fullest copy of the pattern — narrow, describe, continue, and a try/catch to `reportBreak` — and the one whose continuation must name the id the lifecycle minted rather than the Resource that appeared.

## Build

- [x] `spaceResourceRefusal` is deleted from App; `creatingSpaceResource` stays (pending flags are out of scope) and is still cleared in `finally`.
- [x] Title minting (`nextSpaceTitle`), `resolveMap` and `centreAnchor` stay in App.
- [x] `unchanged` requests no continuation, as today.

## Tests

- [x] `command-outcomes.test.ts`: `continueAt` names the result's `resourceId`; a throw publishes the creation break sentence and reaches the reporter.
- [x] `space-resource-authoring.test.tsx` keeps its "Space not created" assertions unchanged.

## Done when

- [x] `rg "setSpaceResourceRefusal" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments

**2026-09-23, resolved.** `pnpm verify` green (236 files, 3050 tests). `pnpm e2e` was not run by this ticket's agent — the coordinator runs it for the branch — so the verify/e2e box stays open until it does.

- **`createSpaceResource` is one `run('space-resource-create', async () => …, { continueAt })`.** The `async` thunk holds title minting, `resolveMap` and `centreAnchor`, so a throw from any of them arrives as a rejection and publishes `describeSpaceResourceCreationBreak` exactly as the old catch did; `continueAt` names the result's `resourceId`. `creatingSpaceResource` is cleared in the returned promise's `finally`, which never rejects because `run` answers `COMMAND_BROKE` for a throw.
- **No module change beyond a comment.** Ticket 01 had already declared the command with `describeSpaceResourceRefusal`, `describeSpaceResourceCreationBreak` and `unchanged` → no continuation, matching App; the "It names what died" rationale for the title moved from App's deleted `ShellNotice` to the channel's table entry.
- **One ordering change.** The notice now draws in `COMMAND_CHANNELS` order, so while ticket 09 has not yet moved the Map notices, "Space not created" draws before the legacy "Map not created"/"Map unchanged"/"Map not deleted" notices rather than after them.
- Tests added to `command-outcomes.test.ts`: `unchanged` requests no continuation and leaves the channel clear; an `async` thunk that throws before its await publishes the break sentence, reaches the reporter and requests no continuation. The `continueAt`-names-`resourceId` and asynchronous-break tests ticket 01 wrote already covered the rest. `space-resource-authoring.test.tsx` is unchanged and green.
