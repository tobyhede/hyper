# 02 — Open and Close move their neighbours once

Status: resolved
Blocked by: 01

**What to build:** The `opened-card` and `closed-card` completions apply the
transform to the Layout they complete against, writing the neighbours' new
positions (ADR 0084).

**Why:** This is the Edit the displacement belongs to. An author opening a Card
is making a Layout decision, and the room it needs is part of what that decision
does.

- [x] `opened-card` applies `Placement.displace(placement, cardId, growth)` with
      `growth = openSize − COLLAPSED_CARD_SIZE`, alongside the `open` and
      `openSize` it already writes. One Edit, one revision.
- [x] `closed-card` applies the negated growth of the size the Card was actually
      Open at, alongside clearing `open`. The remembered Open Size is untouched
      (ADR 0066), so the next Open applies the same growth again.
- [x] Both read the Layout **as it is at that moment**. Close reclaims from every
      Card currently beyond the closing Card, including ones the author moved
      there while it was open. Nothing records who was pushed.
- [x] Open then Close with no move between them returns every position to what it
      was, which follows from 01's property and is asserted here at the Edit.
- [x] A Card opened while another is already Open takes the already-Open Card's
      room as it finds it — the positions are authored by then, so there is no
      summing over Open Cards and no visit-order question left to answer.
- [x] Refusals are unchanged: `card-not-in-layout` still answers a subject the
      Layout does not hold, and an already-Open Card is still `unchanged`.

The Edit now changes more than one Card's position, so undoing it undoes all of
them. That is what the Edit did under the derived model too; it just declined to
write it down.

## Answer

`opened-card` applies `Placement.growth(openSize)` and `closed-card` applies the negation of
the growth of the size the Card was actually Open at, both through one helper,
`withRoomFor(placement, cardId, at, room)` in `space-authoring.ts`.

**Order is decided and documented rather than left to chance.** The entry is written first and
the displacement runs over the result. The coordinates are identical either way — `displace`
compares neighbours against the *subject's* `x`/`y` and neither step moves the subject — but
each answers a new map, so one has to be second, and it must be the one that has to see the
whole map. Writing the entry first also guarantees the subject is a member when `displace`
runs, which matters because `displace` answers unchanged for a subject the map does not hold.

Both arms read `completedPlacement` as it stands at that moment; nothing records who was
pushed. The exampled evidence is in `space-authoring-operations.test.ts`'s
`Expanded Card geometry`, including the memoryless case — a Card the author dragged beyond the
Open Card while it was open is reclaimed on Close although the Open never pushed it, with
ADR 0084 named in the test so it is not later read as a bug. Ticket 06 generates the same
claims.

Refusals are unchanged: `card-not-in-layout` for a subject the Layout does not hold, and an
already-Open Card is still `unchanged`.
