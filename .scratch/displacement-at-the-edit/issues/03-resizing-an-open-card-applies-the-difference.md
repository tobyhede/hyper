# 03 — Resizing an Open Card applies the difference

Status: ready-for-agent
Blocked by: 01

**What to build:** `resized-card` applies the difference between the old growth
and the new one, so the room an Open Card holds tracks its size (ADR 0084).

**Why:** Open and Close are the two ends of the same transform; a resize is a
move between them. Without this, a Card resized while Open holds the room it had
when it opened.

- [ ] `resized-card` applies `Placement.displace(placement, cardId, newGrowth −
      oldGrowth)` alongside the size it already writes, where each growth is that
      size less `COLLAPSED_CARD_SIZE`, floored per axis.
- [ ] The Close snap (ADR 0066) is unaffected: it decides whether the completion
      is a Resize or a Close, and each then applies its own transform. A snapped
      Close reclaims the whole growth, exactly as 02's Close does.
- [ ] A resize that changes one axis only moves neighbours on that axis only.
- [ ] Resizing to the same size is `unchanged` and moves nobody.

Open, resize, resize back, close returns every position to where it started —
the same round trip as 02, through a longer path.
