# 03 — Rename a Card by double-clicking its title

**What to build:** Give the title its own pointer gesture — a double click begins
the inline rename that `F2` and the corner affordance already begin — without
opening the Card underneath it.

**Blocked by:** `02` — Select a Card on click and open it on double click. Until
opening leaves the single click, the first of these two clicks opens the Card and
the title is no longer on screen for the second.

**Status:** resolved

- [x] A double click on a Card's title begins inline title editing.
- [x] That double click does not open the Card, and does not zoom the canvas.
- [x] It needs no prior selection: the gesture acts on the Card under the pointer, selecting it on the way as any click does.
- [x] A double click anywhere else on the Card — description, alias marker, padding — still opens it.
- [x] The gesture obeys the one rule already governing title editing: offered only when the graph is editable, nothing is open over it, and it is not presenting.
- [x] The draft it begins behaves identically to the one `F2` and the affordance begin: `Enter` and valid blur complete, `Escape` cancels, an invalid title reports its field error and commits nothing, an unchanged title is a no-op.
- [x] Renaming through this gesture completes through Space Authoring like the other two, converting an Algorithmic View without moving Cards and updating a selected Layout in place.
- [x] It is proven unreachable before `02` lands and reachable after, rather than only by a test written alongside the implementation.
- [x] Playwright proves a rename begun by double click persists and survives reload.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

The title carries its own `onDoubleClick`, stopping propagation so the Card
beneath does not open. It needs no prior selection and reuses the draft the `F2`
path already had, so completion, cancellation, validation and the no-op case
came with it.

Landed with `02` rather than after it, because the two share the collision over
which pixels each gesture owns — see `02`'s answer.

`pnpm verify` green (74 files / 707 tests). `pnpm e2e` green (64).
