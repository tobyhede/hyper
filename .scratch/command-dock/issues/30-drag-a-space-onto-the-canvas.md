# 30 — A Space in the Resources list can be dragged onto the canvas

Status: resolved
Blocked by: 29.

**What to build:** A Space row in the Resources list (the Spaces-in-this-Meta-Space source) carries the grip and starts a drag, like a Resource row. Dropping it on the canvas authors the Space Resource that frames that Space at the drop point, in the selected Map. Pressing the row still places it at the centre — the drag is the shortcut, never the only way (ADR 0082).

## Refusals

A drop reports exactly as a press does. Pressing a Space row resolves to a sentence or nothing; the list draws the sentence in its "Resource not added" alert, but only on the opening of the list that asked (`StandingRefusal`), and a thrown failure is also reported on the operational channel.

The drop reuses that path rather than opening a second channel. The list is deliberately not dismissed by an outside press or a focus-out, so the list that started a drag is still on screen when it lands. At dragstart a Space row hands App a settle callback built from the same settlement the press uses, bound to the current opening; App keeps it on the drag record and, on drop, settles the placement's answer through it. A refusal therefore appears on the list that asked, and is dropped only in the case the press already drops it: the list was closed before the answer arrived.

## Why

The list offered Spaces beside Resources with one row shape, "because to the reader both are 'put this on the canvas'", but only one of them could be dragged. The row's own comment recorded the Space as "a press and not a drop" — a description of what was built, not a decision; no ADR or ticket rules the gesture out.

## Acceptance criteria

- [ ] A Space row draws the grip and is draggable; its tooltip names both gestures, as a Resource row's does.
- [ ] Dropping a Space row on the canvas pane authors one Space Resource for that Space, titled with the Space's title, positioned at the drop point, in the selected Map.
- [ ] A drop outside the pane, or while the canvas is not authorable, authors nothing.
- [ ] A Space drag cannot be completed as a Resource drop, nor a Resource drag as a Space drop.
- [ ] A refused or broken drop shows its sentence in the list's alert on the opening that started the drag, and a break is also reported on the operational channel.
- [ ] Pressing a Space row still places it at the centre.
- [ ] The Resources popover story, its parity claim, the Ladle spec and an E2E drop test cover the new gesture.
