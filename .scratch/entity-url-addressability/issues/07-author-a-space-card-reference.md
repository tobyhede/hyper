# 07 — Author a Space Card reference

**What to build:** An author can create a Space Card for a new or existing Space, select the Space View and Graph it shows, and see that selection rendered in the Card. The target Space remains independent of every Card that references it.

**Blocked by:** 01 — Give Computed Views durable Space View IDs; 03 — Address every Space View; acceptance of ADR 0068's canvas UX direction.

**Status:** ready-for-agent

- [ ] Creating a Space Card can create a new normal Space or reference an existing one through the same Card shape.
- [ ] The immutable Space reference and editable Space View and Graph selections survive persistence and reload.
- [ ] Many Space Cards may reference the same Space, cycles are refused, and deleting a Space Card never deletes its target.
- [ ] The accepted canvas direction renders the selected Space View and exposes the agreed authoring controls.
- [ ] `pnpm verify`, `pnpm e2e` and the relevant Ladle E2E evidence pass.
