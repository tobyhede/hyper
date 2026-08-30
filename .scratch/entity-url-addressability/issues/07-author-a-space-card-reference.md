# 07 — Author a Space Card reference

**What to build:** An author can create a Space Card for a new or existing Space, select the Space View and Graph it shows, and see that selection rendered in the Card. The target remains independently editable while its lifetime is owned by its references.

**Blocked by:** 01 — Give Computed Views durable Space View IDs; 03 — Address every Space View; `space-cards/03` — Build the Space Card kind and atomic lifetime operations.

**Status:** ready-for-agent
Tags: release/v1

- [ ] Creating a Space Card can create a new ordinary Space or reference an existing one through the same Card shape.
- [ ] One supplied creation title seeds the Space Card and new Space, after which
      their titles are independent; the target begins with Markdown Card `Card 1`.
- [ ] The immutable Space reference and editable Space View and Graph selections survive persistence and reload.
- [ ] Many Space Cards may reference the same Space and cycles are refused. Deleting one reference preserves the target while another remains; deleting the last reference to an **ordinary** Space atomically deletes it and every newly-unreferenced descendant. The Meta Space is permanent and no deletion reaches it — the cycle rule already refuses any Space Card that would reference it (ADR 0074).
- [ ] Opening exposes the selected target context and the Space Card authoring capabilities without prescribing a canvas composition or control placement.
- [ ] `pnpm verify`, `pnpm e2e` and the relevant Ladle E2E evidence pass.
