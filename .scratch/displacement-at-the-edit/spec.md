# Displacement is applied by the Edit that causes it

Opening a Card moves the Cards it grows past **once**, as part of the Open Edit,
writing their new positions into the Layout. Closing reclaims that room the same
way. Between those Edits the Layout's positions are what the canvas draws, with
nothing derived on top. Dragging a Card is React Flow's default drag: it moves,
it is dropped, it lands where it was dropped, whatever its size.

ADR 0084 is the decision. It refines ADR 0064, whose "displacement is derived and
never written to the Layout" it reverses.

## Why

Three defects reported from the canvas are one defect. `Placement.drawn`
recomputed every Card's drawn position from every Open Card's *authored* origin,
on every render, with a strict `>` per axis:

```
B open 800x600, A closed at y=400

B.y=400  ->  A drawn y=400
B.y=399  ->  A drawn y=854     one pixel of B moves A by 454
```

1. An Open Card's **size** decides where every other Card is drawn. That is an
   assumption React Flow does not make about a drag, and neither should we.
2. The rule is a **step**, so the canvas moves discontinuously as an Open Card is
   dragged across its neighbours' origins — they jump to align under it, and back
   on the return.
3. Because no authored coordinate draws inside an Open Card's growth,
   `Placement.authoredPoint` cannot invert a drop that lands there and **clamps to
   the near side** — so a closed Card released near an Open Card settles on that
   Card's origin rather than at the drop point.

`.scratch/expanded-cards/issues/06` previewed (2) during the gesture. That made
release still and left the jump in place, now under the pointer.
`.scratch/expanded-cards/issues/07` measured (3) and weighed three treatments,
each of which began by accepting the law that creates the band. Both are closed
by this work rather than answered by it.

## Shape

- **The rule is unchanged.** `g = openSize − COLLAPSED_CARD_SIZE`, floored at
  zero per axis. Every Card in the Layout whose authored `x` is strictly greater
  than the subject's gains `g.width`; independently, every Card whose `y` is
  strictly greater gains `g.height`.
- **When it runs changes.** Open applies `+g`, Close applies `−g`, Resize applies
  the difference between the old and new growth. Each is part of that Edit and
  writes real authored positions.
- **Memoryless.** Open and Close each read the Layout as it is at that moment.
  Close reclaims from everything currently below and right of the Card, including
  Cards the author moved there while it was open. No per-open-Card record of who
  was pushed.
- **`Placement.drawn` and `Placement.authoredPoint` are deleted**, not reduced.
  `Placement.next` merges what the canvas reports directly.
- **Drag is React Flow's default.** No `move` draft. A settled drag authors the
  drop point exactly.
- **Open Size is untouched** (ADR 0066): stored on the Card's own placement entry,
  and the magnetic Close snap is about that Card's rect, not its neighbours'.

## What this is not

Not a change to which Cards a Layout owns, what a Graph draws, or how an
automatic `LayoutStrategy` computes an arrangement it is asked for. Not a change
to Open Size, its persistence, or the Close snap. Not overlap avoidance — Cards
may overlap, and moving them apart is authorship.

## Tickets

`01` is the domain and everything else depends on it. `02` and `03` are the two
Edit sites. `04` removes what the deletion leaves stranded in the render adapter.
`05` and `06` are the evidence, and `07` closes the two superseded tickets.

| #  | Ticket |
| -- | ------ |
| 01 | The transform is a domain operation, and `drawn` is deleted |
| 02 | Open and Close move their neighbours once |
| 03 | Resizing an Open Card applies the difference |
| 04 | A dragged Card displaces nobody |
| 05 | A drop lands where it was dropped, whatever is open |
| 06 | Opening and closing round-trips the Layout |
| 07 | Close the superseded displacement tickets |
