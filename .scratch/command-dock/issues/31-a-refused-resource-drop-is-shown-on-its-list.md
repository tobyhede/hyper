# 31 — A refused Resource drop is shown on the list that started it

Status: resolved
Blocked by: 30.

**What to build:** Dropping an existing Resource onto the canvas shows a refusal in the Resources list's "Resource not added" alert, as pressing the row already does. Today the drop discards the sentence.

## Why

The discard is justified in App by "a drop ends on the canvas, and by then the list that named the Resource may be dismissed, leaving nowhere the sentence belongs." The list's own dismissal rules make that false in the ordinary case: it ignores an outside press and a focus-out precisely so a drag out of it survives, so the list that started the drag is still open when it lands.

Ticket 30 builds the path for a Space drop — a settle callback bound to the opening that started the drag, held on the drag record. A Resource drop spends the same path; its answer is synchronous, so it settles immediately.

## Acceptance criteria

- [ ] A refused Resource drop shows its sentence in the list's alert while the opening that started the drag is on screen.
- [ ] A completed Resource drop draws no alert and clears a standing one, as a completed press does.
- [ ] The comment justifying the discard is removed with the discard.
- [ ] A unit test covers the refused drop.
