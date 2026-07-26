# An edit stops writing; a save is asked for

Status: resolved

ADR 0029. Remove the save-on-every-revision effect in `App` and replace it with an action the author invokes, from a toolbar button or `Cmd-S`/`Ctrl-S`.

## The store

`savedRevision`, beside `revision`, and `markSaved(revision)`.

`markSaved` takes the revision it is acknowledging rather than reading the current one, because the save is a round trip: drag, press Save, drag again while the request is in flight, and reading `revision` at response time would mark the second drag saved when only the first was sent. It never moves backwards either, so a slow response for an older save cannot un-acknowledge a newer one.

Unsaved is `revision !== savedRevision`, derived — not a third field that can disagree with the two it is computed from.

Both start at 0, so a freshly opened space is saved. That is right even for a minted new space whose cards exist in no file yet (ADR 0018): opening one and writing it to disk unasked is the same failure as saving a stray drag, one step earlier.

## The write

`saveSpace` returns whether it wrote. Today it returns `void` and swallows the response, so there is nothing to key `markSaved` off. `false` for a failed or refused write — a 501 from a server with nowhere to write, a build with no endpoint at all — which leaves the space unsaved, which is accurate.

## The triggers

A `Save` button in the toolbar, disabled when there is nothing to save; that disabled state *is* the unsaved indicator, per ADR 0025 ("a save-state indicator, not a mode indicator").

`Cmd-S`/`Ctrl-S` calls the same action and always `preventDefault`s, including when the space is already saved — the browser's own save-page dialog is a worse outcome than a no-op.

The action samples the store rather than closing over it, the way the existing effect samples `activeRouteId` (ADR 0028), so what is written is exactly the revision that was serialized.

## Tests

Unit, in `editor.test.ts`: a fresh store is saved; `markSaved` after an edit clears it; an edit arriving between serialization and acknowledgement leaves the space unsaved; `markSaved` with a stale revision does not.

e2e, `new-space.spec.ts`: the existing round trip drags, presses Save, waits for the write, reloads, and finds the card where it was left. A second test drags, reloads *without* saving, and finds it back where the last save left it — the assertion that proves the drag itself no longer writes.

e2e, `editing.spec.ts` (read-only server, so it asserts the control and not the write): Save is disabled on load and enabled after a drag.

## Answer

Built as specified. `savedRevision` + `markSaved(revision)` in the editor store, `saveSpace` returning whether it wrote, and a `save` callback in `App` behind a toolbar button and `Cmd-S`/`Ctrl-S`. The save-on-`revision` effect is gone.

Two things the ticket did not say, decided while building:

**`save` samples the editor store too, not just the space store.** ADR 0028 already had it sampling `activeRouteId` to keep activation out of the dependency array. Reading `revision` and `positions` the same way does a second job: it fixes what is being acknowledged at the moment of serialization, which is what makes the in-flight case correct rather than merely tested. It also leaves the callback with one dependency (`markSaved`, a stable store action), so both triggers hold the same identity for the life of the app.

**The Save button is the indicator, and says so twice.** Accent variant and enabled when unsaved, neutral and disabled when not, with a `title` of "Unsaved changes" / "Saved". A disabled button alone is a weak signal for something the author has to notice before closing the tab; the colour change is what makes it visible at a glance, and it costs no new component.

Unit tests are a second `describe` in `editor.test.ts` — four cases, including the two the argument-taking signature exists for (an edit landing mid-flight leaves the space unsaved; a stale acknowledgement does not walk `savedRevision` back).

e2e is 31, up from 28. The one worth naming is `new-space.spec.ts`'s pair: the round trip now presses Save, and beside it a test that drags, reloads without saving, and finds the card where the *last save* left it. They only discriminate together — either one alone passes under a bug — and they have to live in the new-space project, because the fixture server is read-only and an unsaved-reload assertion there would pass whether or not the drag wrote.

`pnpm verify` green, 249 tests across 24 files. `pnpm e2e` 31 green. The fixture is unchanged after the run, which is the other thing worth checking on a change to when writes happen.
