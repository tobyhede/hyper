# 05 — Address Graphs canonically and in a Space View

**What to build:** A person can copy and open either a canonical Graph link or a link to that Graph in the current compatible Space View. Navigation establishes the Graph context without editing authored selections.

**Blocked by:** 03 — Address every Space View.

**Status:** ready-for-agent

- [ ] A canonical Graph link opens its owning Layout and activates the Graph for navigation only.
- [ ] A contextual Graph link establishes the named compatible Space View and Active Graph.
- [ ] An incompatible or unresolved contextual combination returns an actual HTTP 404 rather than choosing another View or Graph.
- [ ] Copy-link commands expose canonical and contextual meanings, and direct navigation, reload, Back and Forward preserve them.
- [ ] `pnpm verify` and `pnpm e2e` pass.
