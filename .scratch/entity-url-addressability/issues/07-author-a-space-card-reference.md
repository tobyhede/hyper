# 07 — Author a Space Card reference

**What to build:** An author can create a Space Card for a new or existing Space,
select the Layout and Graph it shows, and see that selection rendered in the
Card. The target remains independently editable while its lifetime is owned by
its references.

**Blocked by:** `layout-only-v1/03`; PR 134 delivered the Space Card aggregate
and atomic lifetime foundation.

ADR 0079 settled the selection this Card stores: a Space Card selects a Layout
and a Graph, and there is no Space View or Computed View alternative.
`layout-only-v1/03` retires the Space View selection this ticket must not author.
`layout-only-v1/04` owns the Space Card's content shape and the initialization a
layoutless target needs, and it waits on `space-cards/01`, which waits on this
ticket — so 04 is downstream of this ticket, not a blocker of it. This ticket
owns creation, title seeding, the cycle rule and the deletion cascade; the Open
and Enter surface that reads those selections belongs to 08.

**Status:** ready-for-agent
Tags: release/v1

- [ ] Creating a Space Card can create a new ordinary Space or reference an existing one through the same Card shape.
- [ ] One supplied creation title seeds the Space Card and new Space, after which
      their titles are independent. A new target Space is created complete through
      the one Space initializer — Markdown Card `Card 1` placed in its authored
      default Layout, one empty Active Graph, and that Layout persisted as
      `defaultLayout` — so creation never produces a blank canvas.
- [ ] Many Space Cards may reference the same Space and cycles are refused. Deleting one reference preserves the target while another remains; deleting the last reference to an **ordinary** Space atomically deletes it and every newly-unreferenced descendant. The Meta Space is permanent and no deletion reaches it — the cycle rule already refuses any Space Card that would reference it (ADR 0074).
- [ ] Authoring the reference — choosing the Layout and Graph the Card shows, and
      the title and deletion above — is reachable from the Card itself, without
      prescribing a canvas composition or control placement.
- [ ] `pnpm verify`, `pnpm e2e` and the relevant Ladle E2E evidence pass.
