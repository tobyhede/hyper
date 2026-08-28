# 03 — Address every Space View

**What to build:** A person can navigate directly to any Computed View or Layout through the same Space View URL shape. Choosing another Space View updates browser history, and reload, Back and Forward restore the named destination without authoring the Space.

**Blocked by:** 01 — Give Computed Views durable Space View IDs; 02 — Open the Entry Space at its canonical URL.

**Status:** ready-for-agent

- [ ] One route shape resolves both Computed Views and Layouts by Space View Id without exposing their variant.
- [ ] Choosing a Space View pushes browser history and direct navigation or reload restores it without changing authored active selections.
- [ ] A malformed identity returns 400, an unresolved Space View returns an actual 404, and a namespace collision is treated as a broken invariant rather than precedence.
- [ ] Server and client navigation use one destination contract and `pnpm verify` plus `pnpm e2e` pass.
