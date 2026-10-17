# 02: The Active Graph is never empty while presenting

**What to build:** While presenting, Navigation's state holds the Active Graph and the presented Resource as values that cannot be missing, so every reader of presenting state stops checking for a missing Graph. `present` and `openPresentation` never publish presenting without a Graph, but `continueInMap` keeps the current mode while it accepts a missing Graph and does not check that the presented Resource is in the Graph it adopts. So this ticket first makes every producer keep the invariant, and only then removes the readers' checks. Its default is that a `continueInMap` that would leave presenting without its Graph, or with a presented Resource outside it, leaves presenting instead. Nothing a presenter sees changes on any path that reaches presenting today with a Graph that holds the presented Resource.

**Blocked by:** 01 (Settle when a presentation starts), which adds reopening tests over the same Navigation fixtures this ticket retypes.

**Status:** resolved — delivered in PR #388.

**Spec:** `.scratch/presentation-notes/spec.md`. **Review:** candidate 3 of the 2026-10-17 architecture review of Presentation Notes on main.

- [x] No Navigation operation publishes presenting without an Active Graph, or with a presented Resource outside it; a test drives `continueInMap` while presenting with a missing Graph and with a Graph that lacks the presented Resource.
- [x] Presenting state says by its type that it has an Active Graph and a presented Resource.
- [x] The Stage, the presenting chrome, the presentation link and the rehearsal notes read the Graph without a null check.
- [x] The Navigation address stays derived and is never stored (ADR 0081).
- [x] Test fixtures that build a presenting state change only where the narrower type requires it, such as one with no Graph; no assertion about behaviour changes, and ticket 01's tests pass.
