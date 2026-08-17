# 07 — Rebuild presentation chrome with design-system components

**What to build:** Make Graph traversal choices, keyboard guidance, end-of-Graph feedback and the Overview exit control one accessible presentation surface built from the shared design system.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-agent

- [ ] Available moves, selected moves and the end state are visually and accessibly distinct without changing traversal behaviour.
- [ ] Keyboard guidance and the Overview exit preserve their current actions and remain usable at narrow viewport sizes.
- [ ] Ladle shows real presentation states for no moves, one move, branching and retreat availability.

## Audit note

No production presentation-state catalogue landed for the required no-move,
single-move, branching and retreat cases. The production presentation chrome
also remains outside the new design-system composition; both halves belong to
this ticket.
