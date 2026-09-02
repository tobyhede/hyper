# 10 — Deep-link cross-Space presentation points

**What to build:** A person can copy and open a presentation link whose current Card lies beyond one or more Space Card crossings. The URL restores the exact containing Graph context that determines the available exit Edges without carrying Traversal history.

**Blocked by:** 06 — Deep-link ordinary presentation points; 09 — Traverse into and out of a Space Card.

**Status:** ready-for-agent

- [ ] The URL starts at the root Layout and Graph and canonically encodes the ordered Space Card, target Layout and target Graph crossing stack (ADR 0079).
- [ ] Immutable Space Card references derive every intervening Space, and the final Card resolves in the last derived Space.
- [ ] Explicit URL selections win for navigation without editing Space or Space Card selections.
- [ ] Missing, incompatible or changed crossing context returns an actual HTTP 404 rather than dropping context or choosing fallbacks.
- [ ] Presentation moves add only local browser history; the copied URL does not encode the path previously traversed.
- [ ] `pnpm verify` and `pnpm e2e` pass.
