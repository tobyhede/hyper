# 02 — Open a Card only through its own control

**What to build:** Take opening off the pointer. The affordance and the keyboard
open a Card; nothing a pointer does to a Card's body does.

**Blocked by:** `01` — the pane must be the editor before opening means editing.

**Status:** resolved

- [x] No pointer gesture on a Card's body opens it; a single click still selects.
- [x] `onNodeDoubleClick` is removed, and React Flow's double-click zoom stays off.
- [x] The Card affordance opens the Card, and is the only pointer route to it.
- [x] `Enter` and `Space` on a focused Card open it, and that test is not weakened — it is the guard that the keyboard path did not follow the pointer.
- [x] The title's double click renames and no longer competes for the centre of a Card, so the title need not be shrunk to its text to stay reachable.
- [x] Opening and editing collapse to one application path rather than two that happen to agree.
- [x] An Alias offers no affordance and cannot be opened by keyboard either — the gate covers both routes, not just the control.
- [x] The e2e that opens an Alias to read its target's content is deleted rather than adapted; it asserts a capability this withdraws.
- [x] Every remaining call site that opened a Card by double click uses the affordance or the keyboard.
- [x] Nothing opens while presenting, by any route.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

`onNodeDoubleClick` is gone and `onEditCard` collapsed into `onOpenCard` — there
was never a second thing for it to do once opening meant editing. `App` gates
that one path on `editableCardIds`, so an Alias is unreachable by the affordance
*and* by `Enter`/`Space`, rather than only losing its control.

The title no longer competes for the centre of a Card, so `width: fit-content`
on the title is no longer load-bearing. It is left in place because `cursor:
text` on the text alone is still the only thing distinguishing rename from the
Card around it.

The alias e2e was cut in half rather than adapted: the marker naming its target
still holds, and where it used to open the alias it now asserts there is nothing
to open and renames it inline instead. That keeps the withdrawn capability
visible in the suite rather than silently absent.

`pnpm verify` green (74 files / 712 tests). `pnpm e2e` green (65).
