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
      on whether the Card is Markdown, Alias, Space, or a future kind. This is a
      rule about the *rule*, not a claim that every kind can reach Open — see
      "The Alias contract" below for what actually Opens.
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
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass at the branch head,
      with the real output recorded. All three pass. Issue 03's "Verification
      status" holds the one branch-wide answer and the run it was taken from; the
      numbers recorded below this line predate the rebase and are kept only as
      the superseded run they are.

## Answer

Built by the resize-control commit on this branch. It was written when the
branch sat on `feat/card-resizing`; the branch has since been rebased, so the
SHA that record originally named no longer resolves here and has been dropped
rather than guessed at. Read `git log` for the current one.

`CardNode` renders one `NodeResizeControl` at `position="bottom-right"` with a smaller `.rf-card-node__resize-mark` span inside it, so the hit target is the control and the mark is only what it draws. `NodeResizer`'s twelve controls are gone, and with them `growsFromOrigin` and its `shouldResize` guard: a bottom-right-only control cannot move the authored origin, so the guard had nothing left to refuse. Availability is `data.expanded === true` in the adapter (`CardNode.tsx`) and `node.data.expanded === true && canAuthorOnCanvas` in `SpaceCanvas` — the Card-kind test was removed from both. (The field is spelled `expanded` on this branch; the Open/Closed rename of that identifier lives on `feat/card-resizing` and is not in this history.) The composition's single condition was split in two, because resize belongs to Card while the body editor belongs to the Markdown kind.

### The Alias contract

**Open is not a canvas state an Alias reaches, and the Open Alias in the tests is a fixture that proves the rule is kind-independent.** Both halves are the contract; neither is a hedge.

- **The rule is kind-independent.** `CardNode.tsx` draws the control on `data.expanded === true`, and `SpaceCanvas.tsx` supplies the resize capability on `node.data.expanded === true && canAuthorOnCanvas`. Neither reads `kind`. A kind that gains an Open front later inherits resize with no edit to either seam — which is the whole point of the checklist's first item.
- **Nothing Opens an Alias.** `App.tsx`'s `openCardForEditing` branches on the kind: an Alias is routed to `openCard(cardId)`, the transient metadata-authoring pane for its Title and Target, and never to `authoring.complete({ kind: 'opened-card' })`. That is ADR 0064's decision — an Alias has no content front of its own, and its dialog is explicitly not content Opening. `projection.ts` closes the door a second time: `expandedCardIds?.has(card.id) === true && card.kind === 'markdown'` gates the flag, so even a Layout that named an Alias Open would draw it Closed and hand it no resize capability.
- **So the Open Alias in `CardNode.test.tsx` and `SpaceCanvas.test.tsx` is a seam fixture, not a canvas state.** It constructs `data.expanded === true` on an Alias directly, below both gates, to assert that the resize seam asks about Open state and not about kind. It is evidence for the rule; it is not evidence that an author can produce that Card, and it must not be read as authorising one.
- **The application evidence therefore proves resize on an Open Markdown Card only**, because that is the only Card the application can Open today. Nothing here is a defect to fix — an Alias becomes resizable the day ADR 0064's open question about an Alias's Open front is answered, and no change to the resize seams is owed then.

`onResizeStart` calls the existing `onSelectCard`, which installs `{kind:'card'}` into the one discriminated canvas selection — so a Selected Edge is cleared by construction, and selection is not an Edit.

**Two defects were found by driving the real gesture, both of which the first green run had hidden.** React Flow's own `.react-flow__resize-control.handle` declares width, height, border and background at two classes; the rule styling it named one class, lost the cascade, and the control rendered at React Flow's 5px in its own colour. The Ladle test passed over this because it asserted `opacity` — the one property React Flow leaves alone — and because a test-driven pointer hits a 5px target exactly where a hand cannot. Separately, withholding `pointer-events` until reveal deadlocked the gesture outright: React Flow centres the control on the corner, so half of it lies outside the Card, and a pointer arriving there hit the pane instead, un-hovered the Card, and had the control withdrawn from under it — `onResizeStart` and `onResizeEnd` never fired at all. The control is now qualified by `.rf-card-node__inner` to outrank React Flow without this repository naming a bare `.handle` it does not own, and only `opacity` is withheld at rest.

A third change was made and then **reverted**: an in-flight-resize exemption in the render adapter's `reconcile`, on the theory that selecting at drag start recomputes the projection and clobbers the live rect. With the gesture actually working, the test passes with and without it, so it was speculative state and was removed rather than shipped. Live drag feedback works through React Flow's own dimension changes; the Layout-wide displacement preview remains issue 03.

### Audit against the checklist

Item 1 is pinned by unit tests at both seams — `CardNode.test.tsx` ("offers a resize control on an Expanded Alias, because resize follows state rather than Card kind" — `Expanded` is this branch's spelling of the flag; see The Alias contract above for why that test is a seam fixture) and `SpaceCanvas.test.tsx` ("offers a resize operation to an Open Card whatever its kind"). Item 2 by the single-control count plus the `bottom`/`right` class assertions in both suites, and by `growsFromOrigin` appearing nowhere in the tree. Item 3 by an explicit hit-box assertion (`≥ 20px`, mark strictly smaller) in both the Ladle and the application test — the assertion whose absence let the 5px control through. Item 4 by three separate reveal assertions in the Ladle test, hover, Selection and focus, against a story that now carries a Selected specimen; asserting only the easiest of the three was the audit gap that found this. Item 5 by the application test, which selects an Edge first and leaves the Card unselected, then asserts after one drag that the Card carries `selected`, no Edge does, and the persistence revision advanced by exactly one. Item 6's origin retention and stored Open Size are in that same test; **"survives reload" is proven by issue 01's neighbouring test**, `'resizing an open Card persists its authored rect through reload'`, rather than duplicated here. Item 7 by the story mounting the real `CardNode` through the real `nodeTypes` under the `open-card-offers-one-resize-control` parity claim, with no keyboard resize invented.

### Recorded output — superseded, pre-rebase

**These numbers are not the branch-head result and must not be quoted as one.**
They were recorded against the tree as it stood when this issue was resolved,
before the branch was rebased and before issue 03's draft preview, the story
consolidation and the background-paint change landed on top. Issue 03's
"Verification status" section carries the single current statement for the whole
branch; read it there rather than adding a second answer here.

Superseded run: `pnpm verify` — 155 test files, 1735 passed, 8 skipped, exit 0. `pnpm e2e` — 113 passed. `pnpm e2e:ladle` — 48 passed. `card-expand.spec.ts:15` flaked once locally on an unrelated claim before this work began and has been green on every run since; local runs use `retries: 0` by design.
