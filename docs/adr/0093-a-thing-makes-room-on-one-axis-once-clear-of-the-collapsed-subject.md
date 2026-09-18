# A Thing makes room on one axis, once clear of the collapsed subject

Status: accepted
Refines: 0084

ADR 0084 kept the displacement rule it inherited: every Thing whose authored `x`
is strictly greater than the opening Thing's takes the width growth, and
independently every Thing whose `y` is strictly greater takes the height growth.
It changed only when that rule runs. This changes the rule.

A Thing makes room for a growing subject on **at most one axis**, decided against
the subject's **collapsed** rect:

- a Thing whose `x` is at or past `subject.x + COLLAPSED_THING_SIZE.width` takes
  the width growth, and nothing else;
- otherwise, a Thing whose `y` is at or past `subject.y + COLLAPSED_THING_SIZE.height`
  takes the height growth;
- otherwise the Thing already overlaps the collapsed subject and does not move.

Everything else ADR 0084 decided stands: displacement is applied by the Edit that
causes it, Close applies the negation and Resize the difference, and Open and
Close remember nothing about how the Diagram got the way it is.

## Why the half-plane rule was wrong

"Strictly beyond the origin" treated a Thing standing *beside* the subject as
*below* it whenever its top edge was one unit lower. Combined with the memoryless
Close ADR 0084 chose, that produced a jump the author could not predict: open C,
nudge D — to C's right — a few units below C's top, close C, and D is pulled up
by C's entire height growth, hundreds of canvas units, for room the Open never
took from it. The reported case measured 48 units of vertical offset and a
441-unit jump.

The memoryless Close was not the defect and is not revisited. The set of Things
Close reads was too wide: a Thing beside the subject has no use for the height,
so it should never have been in the set for that axis.

## Why this rule

**One axis is enough to stay clear.** A Thing at or past the collapsed right edge
that takes the width growth is at or past the Open right edge afterwards, so it
cannot overlap the grown subject whatever its `y`; the same holds below. A Thing
clear on both needs only one, and `x` is chosen so that a Thing beside the
subject never moves vertically.

**The collapsed rect keeps Open and Close a pair.** The collapsed size is a
constant, and a nonnegative growth carries a Thing further past the edge on the
axis it moved on while leaving the other axis untouched. So the set Open selects
is the set Close selects, and `displace(displace(p, c, g), c, −g)` is still `p`
for every nonnegative `g`. Measuring against the Open rect would change the set
between the two Edits.

**At or past, not strictly past.** A Thing touching the collapsed edge is clear
of it; one unit short overlaps it.

## Rejected

**Independent thresholds per axis** — the same collapsed edges, but a Thing clear
on both takes both growths. It preserves a grid's shape under an Open, which this
rule does not: a Thing below-and-right of the subject now moves right, while the
one directly below moves down. But it leaves the reported jump in place for any
Thing dragged beside the Open subject lower than its collapsed bottom edge — the
same failure with a larger threshold.

**Bands against the Open rect** — move down only Things whose column overlaps the
subject's Open width. It spares Things far to the left, which both rules above
still move down, but the Open width is not the same at Open, Resize and Close, so
the band changes between the Edits and the round trip fails.

## Consequences

A Thing both right of and below the subject moves right only, so an Open no
longer scales a grid of Things uniformly. A Thing below the subject that is not
clear of it on `x` still moves down, however far to the subject's left it sits.
A Thing the author drops beside an Open subject, at any height, gives
back only the width on Close.

The negative-growth asymmetry ADR 0084 stated survives in the new terms: a Thing
the author drops past the collapsed edge inside an Open subject is clear of it
and was never pushed, so Close carries it back inside the subject and a reopen
skips it.
