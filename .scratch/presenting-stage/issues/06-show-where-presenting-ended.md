# 06: Show where presenting ended

**What to build:** On leaving presenting, the canvas pans to the Resource presenting ended on, instead of returning exactly as it was.

**Blocked by:** 02 — Present on the Stage.

**Status:** needs-triage — deferred on 2026-10-07: ticket 02 returns the canvas unmoved, and whether the pan is wanted is undecided.

- [ ] Decide whether leaving presenting should move the canvas at all before building it.
- [ ] If built, the pan is one camera command issued and never awaited (ADR 0043).
