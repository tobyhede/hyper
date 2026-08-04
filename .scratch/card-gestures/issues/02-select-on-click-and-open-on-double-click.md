# 02 — Select a Card on click and open it on double click

**What to build:** Move opening from the single click to the double click, give
the freed click to selecting, and stop React Flow zooming the canvas on a double
click. Remove what the two click guards had that only a click could need.

**Blocked by:** nothing.

**Status:** resolved

- [x] A single click selects a Card and does not open it.
- [x] The selected Card is visibly selected, so a click that no longer opens does not read as a click that did nothing.
- [x] A double click on a Card opens it in place, exactly as the click used to.
- [x] Opening moves to React Flow's `onNodeDoubleClick`; selection is React Flow's own and is not reimplemented.
- [x] `zoomOnDoubleClick={false}` on the flow — not a per-node `.nopan` exemption and not a per-Card `stopPropagation`, so double click has one meaning across the canvas.
- [x] A double click on a Card leaves the viewport transform unchanged.
- [x] `.card--node` no longer declares `cursor: pointer`, which promised a click target that no longer exists.
- [x] `Enter` and `Space` on a focused Card still open it, and that existing test is not modified — it is the guard that the keyboard path did not follow the pointer.
- [x] `connectionGesture`'s `setTimeout` is deleted and the flag lowered where it is raised; the flag stays, because the Alt listener and the empty-canvas hover tracking read it. A completed connection drag is proven to leave the Card closed.
- [x] `titleEditInvalid` and the swallow-one-click rule are deleted, and a refused title is proven unable to open a Card without them.
- [x] The tests pinning those two guards are rewritten to assert the behaviour rather than the mechanism, not deleted.
- [x] Dragging a Card, drawing an Edge, Alt-drop creation and every presenting refusal behave exactly as before.
- [x] Every existing call site that opened a Card by clicking is moved to a double click; the click in `editing.spec.ts` that blurs a refused title stays a single click, because leaving a field is what it tests.
- [x] `pnpm verify` and `pnpm e2e` pass, and the e2e diff is only clicks becoming double clicks.

## Answer

Opening is `onNodeDoubleClick`; selection is React Flow's, untouched.
`zoomOnDoubleClick={false}` canvas-wide, asserted by comparing the viewport
transform across an open.

`titleEditInvalid` is gone. `connectionGesture` is not — the spec and ADR both
claimed it died, and both were wrong: the Alt-modifier listener and the
empty-canvas hover tracking read the flag. Only its `setTimeout` went, and the
flag is now lowered where it is raised. Corrected before the code was written.

One thing the design did not anticipate and the browser found immediately: a
Card centres its title, so the centre of a Card *is* the rename target. Every
`dblclick()` in the suite was landing on the title and renaming instead of
opening. The title is now shrunk to the text it draws (`width: fit-content`) so
the band either side of it opens the Card, and the e2e helper opens away from
the centre. On a Card whose title fills the width this is still tight.

`pnpm verify` green (74 files / 707 tests). `pnpm e2e` green (64).

## Comments

The double click that opens a Card was removed by `opening-is-editing/02`. It
collided with the title's rename gesture over the middle of a Card, which is
where a pointer goes. Opening is now the Card's own control and the keyboard;
everything else this ticket decided — selection, the zoom, the guards — stands.
