# 02 — Give every Open Card one resize control

**What to build:** Make resizing behavior belong to Card rather than to a Card
kind. Every Open Card can expose one bottom-right React Flow resize control; a
Closed Card remains the fixed Closed Size and exposes none. The control appears
when its Card is hovered, Selected, or contains focus, and resizing changes both
dimensions without moving the authored top-left origin or imposing an aspect
ratio.

**Blocked by:** 01 — Remember Open Size after Close.

**Status:** ready-for-agent

- [ ] Resize availability depends on Open state and authoring availability, not
      on whether the Card is Markdown, Alias, Space, or a future kind.
- [ ] Use one bottom-right `NodeResizeControl`; do not restore `NodeResizer`'s
      twelve controls or expose top/left gestures that would move the origin.
- [ ] The pointer/touch target is comfortably usable while its visible mark
      remains visually proportionate to the Card.
- [ ] Hover provides pointer discovery, selection keeps the control stable and
      supports touch, and Card focus exposes the same authoring affordance.
- [ ] Resizing an unselected Card makes it Selected and clears any Selected
      Edge without producing a separate Edit.
- [ ] Release completes one Resize Edit, stores the new Open Size, retains the
      authored origin, and survives reload.
- [ ] Production-parity application and Ladle behavior prove the shared Card
      control rather than a story-only facsimile. Keyboard resizing is explicitly
      out of scope; do not invent arrow-key behavior.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with the real output
      recorded.
