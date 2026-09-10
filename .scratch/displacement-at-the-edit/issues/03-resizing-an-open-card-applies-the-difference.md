# 03 — Resizing an Open Card applies the difference

Status: resolved
Blocked by: 01

**What to build:** `resized-card` applies the difference between the old growth
and the new one, so the room an Open Card holds tracks its size (ADR 0084).

**Why:** Open and Close are the two ends of the same transform; a resize is a
move between them. Without this, a Card resized while Open holds the room it had
when it opened.

- [x] `resized-card` applies `Placement.displace(placement, cardId, newGrowth −
      oldGrowth)` alongside the size it already writes, where each growth is that
      size less `COLLAPSED_CARD_SIZE`, floored per axis.
- [x] The Close snap (ADR 0066) is unaffected: it decides whether the completion
      is a Resize or a Close, and each then applies its own transform. A snapped
      Close reclaims the whole growth, exactly as 02's Close does.
- [x] A resize that changes one axis only moves neighbours on that axis only.
- [x] Resizing to the same size is `unchanged` and moves nobody.

Open, resize, resize back, close returns every position to where it started —
the same round trip as 02, through a longer path.

## Answer

`resized-card` applies `roomBetween(at.openSize, completion.size)` — the difference between the
two growths, per axis — alongside the size it already writes.

**The magnetic Close is not a second copy of the Close rule.** The snap branch calls the same
`closedCard` helper `closed-card` calls, which reclaims `roomBetween(at.openSize,
COLLAPSED_CARD_SIZE)`. Since the collapsed rect's growth is zero, that difference *is* the
negated whole growth, so Close and the snap state the rule once. A second copy is exactly
where a snapped Close comes to reclaim the collapsed proposal's zero growth instead of the
growth of the size the Card was actually Open at, and there is now a test for that specific
number.

A negative room on an axis is legitimate here and `roomBetween`'s docblock says so: it is the
whole of a shrinking Resize, and every negative room reverses part of a growth a previous Edit
already applied, so the Cards it reclaims from are still beyond the subject when it runs. The
nonnegative bound `Placement.growth` documents is about the Open/Close pair, not about this
difference.

A one-axis resize moves neighbours on that axis only (it falls out of the per-axis difference
and is asserted). Resizing to the same size is still `unchanged` and moves nobody. Open →
resize → resize back → Close round-trips every position, exampled here and generated in
ticket 06.
