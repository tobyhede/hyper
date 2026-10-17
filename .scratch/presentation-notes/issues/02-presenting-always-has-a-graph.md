# 02: The Active Graph is never empty while presenting

**What to build:** While presenting, Navigation's state holds the Active Graph and the presented Resource as values that cannot be missing, so every reader of presenting state stops checking for a missing Graph. `present` and `openPresentation` already never publish presenting without a Graph, so each of those checks is a branch that cannot run. Nothing a presenter sees changes.

**Blocked by:** 01 (Settle when a presentation starts), which adds reopening tests over the same Navigation fixtures this ticket retypes.

**Status:** ready-for-agent

**Spec:** `.scratch/presentation-notes/spec.md`. **Review:** candidate 3 of the 2026-10-17 architecture review of Presentation Notes on main.

- [ ] Presenting state says by its type that it has an Active Graph and a presented Resource.
- [ ] The Stage, the presenting chrome, the presentation link and the rehearsal notes read the Graph without a null check.
- [ ] The Navigation address stays derived and is never stored (ADR 0081).
- [ ] Test fixtures that build a presenting state change only where the narrower type requires it, such as one with no Graph; no assertion about behaviour changes, and ticket 01's tests pass.
