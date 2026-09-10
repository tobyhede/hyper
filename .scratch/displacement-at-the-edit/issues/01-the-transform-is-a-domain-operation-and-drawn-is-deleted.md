# 01 — The transform is a domain operation, and `drawn` is deleted

Status: resolved
Blocked by: none

**What to build:** Give `Placement` one operation that applies a growth to the
Cards beyond a subject, and delete the two members that existed to derive and
un-derive displacement at render time (ADR 0084).

**Why:** The rule is not changing; where it runs is. Once it runs at the Edit,
`drawn` has nothing to compute and `authoredPoint` has nothing to invert — and
`authoredPoint` is the one that cannot be total, which is what produced the clamp
band. Deleting them is the point of the work, not a tidy-up after it.

- [x] `Placement.displace(placement, subjectId, growth)` answers a new Placement
      in which every Card whose authored `x` is strictly greater than the
      subject's gains `growth.width`, and independently every Card whose `y` is
      strictly greater gains `growth.height`. The subject itself never moves. A
      negative growth is how Close is expressed; the operation does not care.
- [x] The comparison is strict and per-axis, exactly as `drawn` had it, so
      `displace(displace(p, c, g), c, negate(g))` is `p` for any `p`, any `c`,
      and any **nonnegative** `g` — asserted as a property, since it is what
      makes Open/Close a round trip.

      **The bound is load-bearing, not a generator convenience.** The involution
      is false for a negative initial growth, and deliberately so: with the
      subject at `x = 0`, a neighbour at `x = 1` and `growth.width = -2`, the
      first call moves the neighbour to `-1`, and the second skips it because it
      is no longer beyond the subject. That is not reachable in the product —
      Open always applies a nonnegative growth and Close always applies the
      negation of one already applied, so every Card that Close must reclaim
      from is still beyond the subject when it runs. Do not "fix" the asymmetry
      by clamping or by remembering who moved; state the bound and keep the
      operation total.
- [x] `Placement.drawn` is **deleted**. Its one production caller,
      `packages/graph/src/positioned.ts:27`, reads the placement directly.
- [x] `Placement.authoredPoint` is **deleted**. `Placement.next` merges what the
      canvas reports without converting it, and its "clamps a rendered coordinate
      inside an expansion gap to its near boundary" test goes with the clamp.
- [x] `packages/app/src/components/EmbeddedLayoutAuthoring.tsx:132` reads the
      placement rather than `Placement.drawn(authored)`.
- [x] `space-authoring.ts`'s two `authoredPoint` calls (the drop anchor at
      `:1154` and the created-Card position at `:1240`) take the point as given,
      because a canvas coordinate is now an authored one.
- [x] `packages/graph/test/placement.test.ts` loses every assertion about drawn
      displacement and the clamp band, and gains the round-trip property. The
      floor-at-zero case (a stored rect smaller than the collapsed size) moves to
      `displace` rather than being dropped.

Growth is floored at zero per axis, as `drawn` floored it and for the same
reason: a stored rect smaller than `COLLAPSED_CARD_SIZE` is bytes, not a shrink
of its neighbours.

## Answer

`Placement.displace(placement, subjectId, growth)` and `Placement.growth(openSize)` are in
`packages/graph/src/placement.ts`; `drawn` and `authoredPoint` are gone from the module and
from the exported object.

The floor lives on `growth` rather than inside `displace`, so the rule has one owner and the
Edit sites in `space-authoring.ts` cannot re-floor or forget to. `displace` takes the growth
it is given and does not care about its sign, which is what lets Close pass a negation and
Resize pass a difference. It answers the placement it was given for a non-member subject or
an all-zero growth, mirroring `remove`, so an Edit that moves nothing keeps the placement's
identity and does not re-run layout.

The round-trip property is in `packages/graph/test/placement.test.ts`
(`round-trips a Layout through opening and closing, for any nonnegative growth`), and the
**nonnegative bound is executable, not prose**: `is not an involution when the negative growth
is applied first` asserts the counter-example this ticket names — subject at `x = 0`,
neighbour at `x = 1`, `width = -2`, so the neighbour reaches `-1` and the negation skips it.
Nobody can now "fix" the asymmetry without a red test explaining why they should not.

The floor case moved to `Placement.growth` as required, asserted twice: that a rect below
`COLLAPSED_CARD_SIZE` yields a zero growth, and that the zero growth then displaces nobody.

Call sites: `positioned.ts` reads the placement directly, `EmbeddedLayoutAuthoring.tsx:132`
reads `[...authored.values()]`, and `space-authoring.ts`'s two conversion sites take the point
as given — a canvas coordinate is now an authored one.
