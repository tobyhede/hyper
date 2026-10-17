# 01: Settle when a presentation starts

**What to build:** A presentation starts when presenting begins from the overview and ends when presenting is left. Going Back or Forward through the talk's history stays inside the same presentation. So does any other reopening of a presented Resource while presenting. The spec says this as one rule, and the rehearsal notes, the talk timer and the presentation link all follow it. Today the spec says the rehearsal notes start off on every `present` *and* every `openPresentation`, while the code resets them only when presenting turns on or off, so the spec and the code disagree.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec:** `.scratch/presentation-notes/spec.md`. **Decision:** ADR 0129; the user chose on 2026-10-17 that Back mid-talk keeps the rehearsal notes showing.

- [ ] The spec's "Rehearsal notes" rule says the notes start off when a presentation starts, and that reopening a presented Resource while presenting (browser Back or Forward included) does not start a new one.
- [ ] A test proves the rehearsal notes stay shown across an `openPresentation` made while presenting, and start off after leaving presenting and presenting again.
- [ ] A test proves the talk timer and the presentation identity the Notes window follows carry on across that same `openPresentation`, and change on a new presentation.
- [ ] An application test proves browser Back mid-talk keeps the rehearsal notes shown and the Notes window following.
