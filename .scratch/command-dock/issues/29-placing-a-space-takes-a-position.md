# 29 — Placing a Space takes a position, and a Resources drag says what it carries

Status: ready-for-agent
Blocked by: None.

**What to build:** A prefactor with no behaviour change, so ticket 30 is the easy change. Two seams move:

- Placing a Space from the Resources list — the `link` of the Space Resource that frames it — takes its anchor as input instead of always reading the canvas centre. Pressing a Space row passes the centre, exactly as today.
- The drag App records when a row leaves the Resources list names what it carries: a Resource or a Space, alongside the Map it was started over. Today the record can only hold a Resource id, so a Space drag has nowhere to be recorded without being mistaken for one.

The canvas drop keeps accepting only a Resource; nothing a reader can do changes.

## Why

Dragging a Space onto the canvas (ticket 30) needs both: the drop point has to reach the Space placement, and the drop has to be checked against the drag that started it the way a Resource drop already is. Landing the seams first keeps ticket 30 to the gesture itself.

## Acceptance criteria

- [ ] Pressing a Space row in the Resources list still authors its Space Resource at the canvas centre, in the selected Map.
- [ ] Dragging and dropping an existing Resource behaves exactly as before, including the check that the drop belongs to the drag started over the same Map.
- [ ] The drag record distinguishes a Resource from a Space by kind, so a Space id cannot be read as a Resource id.
- [ ] Existing unit, E2E and Ladle tests pass unchanged.
