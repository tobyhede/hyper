# 07 — A closed Card dropped beside an Open Card clamps to its origin

**Status:** needs-triage

**What happens:** Release a closed Card within one displacement step of an Open
Card's authored origin, on either axis, and it does not settle where it was
dropped. It snaps back to that origin — by up to the Open Card's whole growth on
that axis.

Split out of `06 — Preview displacement while an Open Card is dragged`, which
fixed the other direction (the Open Card being the one that moves) and left this
one alone. **It may well be right as it stands**; this is a ticket to decide,
not a defect statement.

## The band, measured

Open Card O authored at `x = 10`, `openSize.width = 360`. `COLLAPSED_CARD_SIZE.width`
is 260, so O's step is 100 and its drawn box spans 10→370. Dragging a closed
Card C and releasing it at each drawn `x`:

```
drop   0 -> authored   0 -> lands   0
drop  10 -> authored  10 -> lands  10
drop  11 -> authored  10 -> lands  10   jump -1
drop  60 -> authored  10 -> lands  10   jump -50
drop 110 -> authored  10 -> lands  10   jump -100
drop 111 -> authored  11 -> lands 111
drop 200 -> authored 100 -> lands 200
drop 369 -> authored 269 -> lands 369
```

**It is not the drawn box.** A drop at 200 is visually well inside O and lands
exactly where released. The affected band is `(10, 110]` — one step wide,
beginning at O's *authored* origin — which happens to sit inside the box rather
than being it. Each axis is evaluated on its own, so a drop can clamp on `x` and
be exact on `y`.

## Why the band exists

`Placement.drawn` displaces C by the step when `C.x > O.x`, strictly. So authored
0→10 draw at 0→10 and authored 11 draws at 111: no authored coordinate draws at
11 through 110, because that width is exactly what O gained by opening.
`Placement.authoredPoint` still has to answer for a drop that lands in it, and it
answers the near side:

```ts
} else if (at[coordinate] > drawnOrigin) {
  // Inside the step's unreachable gap, which is the Expanded Card's own
  // drawn box. Authoring the near side is what makes the drop settle where
  // it was released instead of jumping the full growth one frame later.
  authored = point[coordinate];
}
```

The comment states the trade the near side was chosen for: the alternative
(authoring the far side) jumps by the *whole* step in the other direction one
frame later. Pinned by `Placement.next`'s "clamps a rendered coordinate inside an
expansion gap to its near boundary".

## Why ticket 06's answer does not reach it

06 previewed the displacement by moving the Cards *around* the pointer while the
dragged Card stayed on it. That works because the thing that had to move was not
the thing under the cursor, and `reconcile` already has the rule that makes it
possible:

```ts
position: dragOrigins.has(node.id) ? live.position : node.position,
```

> An active drag alone keeps its live position: replacing it would jump the Card
> away from the pointer mid-gesture.

Here the Card that must move **is** the one under the cursor. Previewing the
clamp means drawing C at 10 while the pointer is at 60 — inverting that exact
rule for the dragged node, letting the projection win over the pointer. React
Flow's `XYDrag` computes each frame from pointer delta against its own internal
position, so the node needs continuous override, and it re-attaches to the finger
the moment the drag leaves the band. That trades a jump at release for a Card
that detaches from the cursor by up to a full step and snaps back — plausibly a
worse interaction, not a truer one.

## What to decide

Ranked by how much they cost, cheapest first. The first two are the honest
candidates; the third is recorded because it is what a reviewer will suggest.

1. **Leave it, and say so louder.** ADR 0064 already accepts it — "a Card
   crossing an Expanded Card's authored origin may jump between the two sides of
   the displacement rule" — and read as a *snap to the Open Card's edge* rather
   than as a failed drop, the behaviour is defensible. The work would be to
   confirm that reading against the real canvas and close this `wontfix`.
2. **Show the band.** Draw the destination while the drag is in it — an outline,
   an edge highlight on the Open Card, something that says "this releases at the
   corner" — without moving the Card off the pointer. Keeps `reconcile`'s rule
   intact and turns a surprise into a snap the author can see coming. Needs a
   design pass; treatment, so an issue and a story rather than an ADR.
3. **Preview the clamp for real.** Let the projection win over the pointer for a
   dragged node inside the band. Costs the rule quoted above and an
   attach/detach at the band's edge; would need browser evidence that the
   gesture still reads as a drag. Recorded as the expensive option, not
   recommended.

None of these changes what is authored — the band and its near-side answer are
`Placement`'s and stay `Placement`'s. This is about what the canvas says while
the pointer is down.

## Evidence to reproduce

The sweep above is `Placement.drawn` and `Placement.next` alone; it needs no
canvas. A browser reproduction belongs with whichever option is chosen, since
options 1 and 2 assert different things about the same gesture.
