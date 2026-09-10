# 02 — Open and Close move their neighbours once

Status: ready-for-agent
Blocked by: 01

**What to build:** The `opened-card` and `closed-card` completions apply the
transform to the Layout they complete against, writing the neighbours' new
positions (ADR 0084).

**Why:** This is the Edit the displacement belongs to. An author opening a Card
is making a Layout decision, and the room it needs is part of what that decision
does.

- [ ] `opened-card` applies `Placement.displace(placement, cardId, growth)` with
      `growth = openSize − COLLAPSED_CARD_SIZE`, alongside the `open` and
      `openSize` it already writes. One Edit, one revision.
- [ ] `closed-card` applies the negated growth of the size the Card was actually
      Open at, alongside clearing `open`. The remembered Open Size is untouched
      (ADR 0066), so the next Open applies the same growth again.
- [ ] Both read the Layout **as it is at that moment**. Close reclaims from every
      Card currently beyond the closing Card, including ones the author moved
      there while it was open. Nothing records who was pushed.
- [ ] Open then Close with no move between them returns every position to what it
      was, which follows from 01's property and is asserted here at the Edit.
- [ ] A Card opened while another is already Open takes the already-Open Card's
      room as it finds it — the positions are authored by then, so there is no
      summing over Open Cards and no visit-order question left to answer.
- [ ] Refusals are unchanged: `card-not-in-layout` still answers a subject the
      Layout does not hold, and an already-Open Card is still `unchanged`.

The Edit now changes more than one Card's position, so undoing it undoes all of
them. That is what the Edit did under the derived model too; it just declined to
write it down.
