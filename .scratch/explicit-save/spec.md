# Saving is explicit

Building ADR 0029.

## What the ADR decides

An edit never writes. The space is written when the author asks — `Cmd-S`/`Ctrl-S`, or a Save control — and at no other time. Between an edit and that ask the space is **unsaved**, and the Save control is the indicator that says so.

This is ADR 0025's own mechanism arriving late. 0025 permits any edit to convert an automatic arrangement into a Layout and pays for it with "you see the space is unsaved, you do not save, and nothing durable happened" — a sentence the shipped auto-save made false.

## What the code does today

`App` has an effect keyed on the editor store's `revision`, which counts settled drags and arranges. Every increment serializes the Layout and PUTs it. So a two-pixel drag rewrites `packages/app/fixture/space.json`, repoints `defaultView` at a Layout the author never asked for, and dirties the worktree.

`revision` is already the right signal — it deliberately stays at 0 through the creation sync, so a load never writes. What is missing is the other half: which revision reached disk.

## Shape of the work

Five pieces, all in `01` because none of them stands up alone — `savedRevision` with no action is dead state, and removing the auto-save effect without adding the trigger loses saving entirely:

1. `savedRevision` in the editor store, and `markSaved(revision)` — taking the revision as an argument, because a save is asynchronous and an edit landing mid-flight must leave the space unsaved.
2. `saveSpace` reporting whether it wrote, instead of returning `void` into the dark.
3. The save action, and its two triggers: the toolbar button and `Cmd-S`/`Ctrl-S`.
4. The e2e pair — the round trip goes through Save, and an unsaved reload loses the move.
5. `beforeunload`, held back as `02` because of how Playwright handles dialogs.

## What stays green

The fixture project runs read-only, so nothing in `overview`/`presenting`/`editing` asserts a save today and none of it changes. `editing.spec.ts` gains an assertion on the Save control's state, which is behaviour that did not exist before.

`new-space.spec.ts` is the only place a save is genuinely written, and its round trip is the one existing test that changes: the drag no longer saves, so the test has to ask.
