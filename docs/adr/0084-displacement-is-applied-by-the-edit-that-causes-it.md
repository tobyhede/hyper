# Displacement is applied by the Edit that causes it

Status: accepted
Refines: 0064, 0066
Related: 0014, 0004, 0042, 0005, 0040

Opening a Card makes room for it by **moving the Cards it would grow past, once,
as part of the Open Edit** — writing their new positions into the Layout like any
other authored move. Closing reclaims that room the same way, and resizing an
Open Card applies the difference. Between those Edits the Layout's positions are
what the canvas draws, unchanged and untransformed.

This reverses the sentence in ADR 0064 that said the opposite: "That displacement
is derived and never written to the Layout." The displacement rule itself is
unchanged — a Card beyond an Open Card's origin on an axis takes that Card's
growth on that axis. What changes is **when** the rule runs: at the Edit that
causes it, not at every render.

## Why the derived version had to go

`Placement.drawn` recomputed every Card's drawn position from every Open Card's
*authored* origin, on every render, comparing with a strict `>` per axis. Three
things follow from that, and all three were reported from the canvas as bugs.

**An Open Card's size became an input to every other Card's position.** React
Flow makes no such assumption and neither should we: a Card is dragged and
dropped, and how big some other Card happens to be is not part of that gesture.

**The comparison is a step, so the canvas moves discontinuously.** Measured, with
an Open Card 800×600 against the 260×146 collapsed size:

```
B.y=400  ->  A drawn y=400
B.y=399  ->  A drawn y=854
```

One pixel of the Open Card's travel moves a neighbour by 454. Dragging an Open
Card up past another Card makes that Card jump down to align under it, and back
again on the return. Previewing the step during the gesture — which is what
`.scratch/expanded-cards/issues/06` did — makes release still but does not remove
the jump; it moves it from the moment of release to the moment of crossing, under
the author's pointer, which is a worse gesture and not a truer one.

**Drawn ≠ authored forced an inverse that cannot exist.** Because no authored
coordinate draws inside an Open Card's growth, `Placement.authoredPoint` had to
answer for drops that land there, and answered the near side — so a closed Card
released within one step of an Open Card's origin settles on that origin instead
of where it was dropped, by up to the whole growth.
`.scratch/expanded-cards/issues/07` measured the band and weighed three ways to
decorate it, all of which began by accepting the law that creates it.

The three are one defect. A derivation that runs continuously over authored
positions has to be inverted to author anything, the inverse is not total, and
the gap it cannot cover is exactly the room the derivation invented.

## What this deletes

`Placement.drawn` becomes the identity and is removed. `Placement.authoredPoint`
is removed with it: it exists only to invert `drawn`, and there is nothing left to
invert. `Placement.next` stops converting rendered coordinates into authored ones
and merges what the canvas reports directly, because the canvas now reports
authored positions. A settled drag authors the drop point, exactly.

The render adapter's interaction drafts lose their reason to exist in this
direction. There is no `move` draft, because a dragged Card displaces nobody.
A live resize still previews the Card's own rect, but it no longer republishes
its neighbours, because their positions do not depend on it until the Edit lands.

## The transform, stated once

Opening a Card with growth `g = openSize − COLLAPSED_CARD_SIZE`, floored at zero
per axis: every other Card in the Layout whose authored `x` is strictly greater
than the opening Card's `x` gains `g.width`, and independently, every Card whose
`y` is strictly greater gains `g.height`. Closing applies the same rule with the
sign reversed. Resizing applies the difference between the old and new growth.

The comparison is strict and per-axis, exactly as `drawn` had it, so a Layout
opened and immediately closed returns to the positions it started from.

## Closing reclaims from where things are now

Open and Close each read the Layout **as it is at that moment** and remember
nothing about how it got there. A Card the author dragged below an Open Card
while it was open is below it when it closes, so it moves up with everything else
below it — even though it was never pushed down by the opening.

This is deliberate, and it is what makes the pair memoryless. The alternative is
to record which Cards a particular Open pushed and by how much, so Close can undo
precisely that set; that is per-open-Card stored state, it goes stale the moment
the author moves anything, and it makes two Layouts with identical positions
behave differently because of history neither of them shows. Opening is a Layout
decision taken at a moment. So is closing.

## Authored positions may now be written by the application

ADR 0064 kept displacement derived in order to keep authored geometry authored,
and that concern is real. It is answered rather than dismissed: the author opened
the Card, opening is a Layout decision, and the positions the Edit writes are the
consequence of that decision — the same standing as the positions Add Card writes
when it places a new Card at the visible centre, or the positions a
`LayoutStrategy` writes when an automatic arrangement is accepted into a Layout.
What ADR 0014 forbids is placement *computed at render time in place of
authorship*, and this removes the last of that rather than adding to it.

The visible consequence is that opening a Card is an Edit that changes more than
one Card's position, and undoing it is undoing all of them. That is honest: the
Edit did move them, and under the derived model it moved them too — it just
declined to say so in the document.

## Consequences

The step boundary ADR 0064 accepted, the clamp band, and the two reported jumps
all cease to exist rather than being mitigated, and
`.scratch/expanded-cards/issues/06` and `07` are closed by this rather than
answered. Drag returns to React Flow's default: a Card is dragged, dropped, and
lands where it was dropped, whatever its size or its neighbours'.

`Placement`'s surface shrinks by its two hardest members. What remains — `next`,
`place`, `remove`, `fromEntries` — is a map of authored positions with no derived
layer over it, which is what ADR 0004 said a placement was.

Open Size still survives Closing (ADR 0066), because it is stored on the Card's
own placement entry and this changes nothing about it. The magnetic Close snap is
unaffected: it is about the Card's own rect, not its neighbours'.

Nothing here touches which Cards a Layout owns, what a Graph draws, or how an
automatic strategy computes an arrangement it is asked for.
