# 02 — Give every Open Card one resize control

**What to build:** Make resizing behavior belong to Card rather than to a Card
kind. Every Open Card can expose one bottom-right React Flow resize control; a
Closed Card remains the fixed Closed Size and exposes none. The control appears
when its Card is hovered, Selected, or contains focus, and resizing changes both
dimensions without moving the authored top-left origin or imposing an aspect
ratio.

**Blocked by:** 01 — Remember Open Size after Close.

**Status:** resolved

- [x] Resize availability depends on Open state and authoring availability, not
      on whether the Card is Markdown, Alias, Space, or a future kind.
- [x] Use one bottom-right `NodeResizeControl`; do not restore `NodeResizer`'s
      twelve controls or expose top/left gestures that would move the origin.
- [x] The pointer/touch target is comfortably usable while its visible mark
      remains visually proportionate to the Card.
- [x] Hover provides pointer discovery, selection keeps the control stable and
      supports touch, and Card focus exposes the same authoring affordance.
- [x] Resizing an unselected Card makes it Selected and clears any Selected
      Edge without producing a separate Edit.
- [x] Release completes one Resize Edit, stores the new Open Size, retains the
      authored origin, and survives reload.
- [x] Production-parity application and Ladle behavior prove the shared Card
      control rather than a story-only facsimile. Keyboard resizing is explicitly
      out of scope; do not invent arrow-key behavior.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with the real output
      recorded.

## Answer

Built in `623f12a` on `feat/card-resizing`.

`CardNode` renders one `NodeResizeControl` at `position="bottom-right"` with a smaller `.rf-card-node__resize-mark` span inside it, so the hit target is the control and the mark is only what it draws. `NodeResizer`'s twelve controls are gone, and with them `growsFromOrigin` and its `shouldResize` guard: a bottom-right-only control cannot move the authored origin, so the guard had nothing left to refuse. Availability is `data.open === true` in the adapter and `node.data.open === true && canAuthorOnCanvas` in `SpaceCanvas` — the Card-kind test was removed from both. The composition's single condition was split in two, because resize belongs to Card while the body editor belongs to the Markdown kind. What still keeps an Alias from being resized is that projection never marks one Open, which is content ownership (ADR 0064) and deliberately untouched.

`onResizeStart` calls the existing `onSelectCard`, which installs `{kind:'card'}` into the one discriminated canvas selection — so a Selected Edge is cleared by construction, and selection is not an Edit.

**Two defects were found by driving the real gesture, both of which the first green run had hidden.** React Flow's own `.react-flow__resize-control.handle` declares width, height, border and background at two classes; the rule styling it named one class, lost the cascade, and the control rendered at React Flow's 5px in its own colour. The Ladle test passed over this because it asserted `opacity` — the one property React Flow leaves alone — and because a test-driven pointer hits a 5px target exactly where a hand cannot. Separately, withholding `pointer-events` until reveal deadlocked the gesture outright: React Flow centres the control on the corner, so half of it lies outside the Card, and a pointer arriving there hit the pane instead, un-hovered the Card, and had the control withdrawn from under it — `onResizeStart` and `onResizeEnd` never fired at all. The control is now qualified by `.rf-card-node__inner` to outrank React Flow without this repository naming a bare `.handle` it does not own, and only `opacity` is withheld at rest.

A third change was made and then **reverted**: an in-flight-resize exemption in the render adapter's `reconcile`, on the theory that selecting at drag start recomputes the projection and clobbers the live rect. With the gesture actually working, the test passes with and without it, so it was speculative state and was removed rather than shipped. Live drag feedback works through React Flow's own dimension changes; the Layout-wide displacement preview remains issue 03.

### Audit against the checklist

Item 1 is pinned by unit tests at both seams — `CardNode.test.tsx` ("offers a resize control on an Open Alias, because resize follows Open state rather than Card kind") and `SpaceCanvas.test.tsx` ("offers a resize operation to an Open Card whatever its kind"). Item 2 by the single-control count plus the `bottom`/`right` class assertions in both suites, and by `growsFromOrigin` appearing nowhere in the tree. Item 3 by an explicit hit-box assertion (`≥ 20px`, mark strictly smaller) in both the Ladle and the application test — the assertion whose absence let the 5px control through. Item 4 by three separate reveal assertions in the Ladle test, hover, Selection and focus, against a story that now carries a Selected specimen; asserting only the easiest of the three was the audit gap that found this. Item 5 by the application test, which selects an Edge first and leaves the Card unselected, then asserts after one drag that the Card carries `selected`, no Edge does, and the persistence revision advanced by exactly one. Item 6's origin retention and stored Open Size are in that same test; **"survives reload" is proven by issue 01's neighbouring test**, `'resizing an open Card persists its authored rect through reload'`, rather than duplicated here. Item 7 by the story mounting the real `CardNode` through the real `nodeTypes` under the `open-card-offers-one-resize-control` parity claim, with no keyboard resize invented.

### Recorded output

`pnpm verify` — 155 test files, 1735 passed, 8 skipped, exit 0. `pnpm e2e` — 113 passed. `pnpm e2e:ladle` — 48 passed. `card-expand.spec.ts:15` flaked once locally on an unrelated claim before this work began and has been green on every run since; local runs use `retries: 0` by design.
