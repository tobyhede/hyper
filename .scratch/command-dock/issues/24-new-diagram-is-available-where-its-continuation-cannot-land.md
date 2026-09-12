# 24 — New Diagram is available where its continuation cannot land

Status: needs-triage
Tags: release/v1
Blocked by: nothing. Surfaced reviewing `19`–`21`; the code is `13`'s.

**What to build:** New Diagram is either unavailable, or its continuation
actually opens the name it promised. Today there is a window where it is
available, completes, reports that the caret moved, and leaves the caret on
`document.body`.

## Why

Two availabilities disagree about the same fact.
`authoring-availability.ts`'s `createDiagram` omits `editable`;
`chromeTitleEdit` requires it. So whenever the canvas has no live projection —
`hasThingsOnCanvas === false`, which includes the window after `selectDiagram`
clears `projection`, and a failed placement — New Diagram is enabled while the
Diagram name button is rendered `disabled`.

`ChromeContinuation` spends the continuation by calling `element.click()` on
that button. Base UI's `useButton` early-returns its `onClick` for a `disabled`
control, so no rename editor opens. `DockCanvas.onCreate` has already answered
`true` — meaning "the caret moved" — because it *requested* a continuation
rather than because one landed, so `finalFocus` returns `false`, Base UI skips
returning focus to the chevron, and the caret is left nowhere.

**The evidence that the window is real rather than theoretical** is in
`SpaceApp.test.tsx`: it waits for `selected-canvas` to become available before
pressing New Diagram. That wait is stepping over this.

## The shape of the fix

Either is defensible and they are different decisions:

- Have `ChromeContinuation` report whether it landed, so `onCreate` answers what
  happened rather than what it asked for. This is the general fix — the same
  claim is made by every chrome continuation.
- Gate `createDiagram` on `editable`, so the two availabilities agree and the
  window closes. Smaller, and it withdraws a command that would otherwise work
  for everything except its continuation.

- [ ] The decision is recorded here
- [ ] A test fails without the fix: New Diagram pressed with no live projection
- [ ] `pnpm verify` and `pnpm e2e` green
