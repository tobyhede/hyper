# 02: Resize any selected Resource

**What to build:** the existing bottom-right resize control is offered on a selected Resource, Open or Closed, any kind, wherever its Map may be authored — no longer gated on Open — and not on an unselected one. A selected Resource in a Shape other than the rectangle draws a thin rectangular border around its rect, so the control sits on that border's corner. The control's look and the Edge handles are unchanged.

**Blocked by:** 01.

**Status:** resolved

- [x] Decoration offers resize on selection, not on Open; read-only Maps offer none.
- [x] The Shape border on selection, with Ladle and application proofs (ADR 0052).
- [x] Playwright: resize a Closed Resource and it stays Closed; Open keeps the size; a Shape's control sits on its border's corner.

**Resolution:** `decorateSharedResourceNode` offers `resize` on every kind, Open or Closed, wherever the Map may be authored; `ResourceNode` mounts the control only while the Resource is selected (React Flow's selection or `selectedForAuthoring`) and not read-only, since selection is the node's to know. A selected Shape other than the rectangle draws `.rf-resource-node__resize-frame`, a 1px frame in the Resource's ink at its rect, with the control. The hover and focus reveals are gone; Selection is the one reveal. Parity claim `open-resource-offers-one-resize-control` is now `selected-resource-offers-one-resize-control`, beside the new `selected-shape-frames-its-rect-for-resize`, proved by the `Resize control` story and `resource-shape.spec.ts`.
