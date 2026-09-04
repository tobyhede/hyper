# 08 — Open, enter and independently address a Space Card

**What to build:** A viewer can open a Space Card in place, enter its Space with
the complete working surface, move safely among open Spaces, close an ordinary
context, or open the target independently at its canonical URL.

**Blocked by:** `v1-release/01` — Establish the Meta Space lifecycle; 07 — Author
a Space Card reference; `space-cards/01` — Open and edit a Space Card in place;
`space-cards/10` — Extend the fixture to linked Spaces;
`architecture-review/14` — Build Open Spaces composition.

**Status:** ready-for-agent
Tags: release/v1

- [ ] Opening in place draws the target through the context the Card supplies and
      leaves the target Space's own active selections untouched.
- [ ] Enter shows the target as the Space being worked in, with its complete
      command surface and editing capabilities.
- [ ] Enter loads the target from repository state already accepted by complete
      aggregate intake. Navigation performs no second cycle check and does not
      carry an ancestor chain as an integrity mechanism.
- [ ] Enter resolves the stored context `layout-only-v1/04` owns rather than
      restating it here; this ticket owns the Enter surface, not the selection
      or its write-back rule.
- [ ] Entering an already-open Space reuses its live context. An author can move
      among open Spaces without losing work, close an ordinary context
      explicitly, and never close the Meta Space.
- [ ] Opening independently uses the target Space's canonical address and
      carries no containing navigation or presentation state.
- [ ] Browser Back, Forward and reload reproduce addressable transitions without
      producing an Edit.
- [ ] Persistence waiting, refusal and warning behavior is supplied and proven
      by `architecture-review/14`; its presentation and control placement remain
      UX work.
- [ ] Application and Ladle evidence prove the chosen current UX without making
      that treatment an architectural constraint.

## Deferred

Cross-Space Edges, cross-Space traversal and presentation-point deep links are
outside V1.
