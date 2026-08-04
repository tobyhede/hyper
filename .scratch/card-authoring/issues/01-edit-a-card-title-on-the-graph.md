# 01 — Edit a Card title on the graph

**What to build:** Let an author rename any Card directly where its title is
drawn, completing one validated and automatically persisted Edit without
colliding with opening, dragging or Edge authoring.

**Blocked by:** `space-authoring/05` — Accept the stored Space without
remounting.

**Status:** resolved

- [x] A Card's drawn title signals that it is editable and a double click begins
      title editing outside presenting (ADR 0036).
- [x] `F2` begins title editing for the selected Card without requiring a pointer.
- [x] The inline field begins from the current title and keeps incomplete typing as local draft state.
- [x] `Enter` and leaving a valid changed field complete the title Edit; `Escape` cancels and restores the unchanged Card.
- [x] An invalid title remains local with an accessible field error and cannot reach Space Authoring or persistence.
- [x] Completing the existing title is a no-op that does not convert an Algorithmic View, submit persistence or publish a Space update.
- [x] Pointer and keyboard events inside the editor cannot open, drag, select, connect or otherwise activate the Card underneath it.
- [x] An ordinary Card click outside the title editor selects the Card; opening
      uses the Card's own control or keyboard (ADR 0036).
- [x] The completed value is authoritative in the title editor before it notifies Space Authoring, which derives and validates the complete next Space.
- [x] Renaming a Markdown Card updates every place its title is drawn or listed without changing its content.
- [x] Renaming an Alias changes only the Alias's own title and leaves its target and the target Card unchanged.
- [x] The first title Edit in an Algorithmic View creates and selects the next neutral Layout from the positions already on screen without moving a Card.
- [x] A title Edit in a selected Layout updates that Layout in place and preserves its Route filter and active Route.
- [x] The Edit submits exactly one complete Space snapshot and the new title survives a browser reload through the existing HTTP boundary.
- [x] Presenting exposes no title-edit gesture or title-edit keyboard shortcut.
- [x] Component tests cover the double-click gesture, `F2`, Enter, blur, Escape, validation and event isolation through observable behavior.
- [x] Playwright covers pointer and keyboard title editing, automatic persistence, reload durability and the absence of React Flow warnings or accidental gestures.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Implemented by PR #17 and reconciled with ADR 0036: a click selects, a double
click on the drawn title renames, and the Card's own control opens it. The title
editor keeps incomplete drafts local, validates before notifying Space
Authoring, and persists one complete snapshot without moving Cards or changing
Alias targets. Focused component and browser coverage passes alongside all 744
tests in `pnpm verify` and all 66 tests in `pnpm e2e`.
