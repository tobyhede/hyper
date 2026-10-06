# Size independent of Open

Status: ready-for-agent

Follows `.scratch/shape-independent-of-open/` on PR 338. Decided with the user in grilling on 2026-10-06.

## Problem Statement

Resizing a Resource is tied to Opening it. An author who wants a bigger diamond, or a wider Markdown card, has to Open the Resource first, and Open also changes what is drawn inside it and moves its neighbours. For an Ur Resource, which has no content, Open means nothing except "bigger", so it is a step that only gets in the way. The resize control is drawn only while a Resource is Open, at the corner of a rectangle; on a pill, ellipse or diamond it floats detached in empty canvas.

Underneath, size and Open/Closed are one fact: a Closed Resource is always the fixed Closed Size, an Open one is its remembered Open Size, and Open and Close are what change a Resource's size.

## Solution

Size and Open/Closed are independent.

- A Resource on a Map has a **size**. Resize is the only thing that changes it, and Resize is available on every Resource, Open or Closed, of every kind.
- **Open** is a UX affordance offered only by kinds that have content to show (Markdown, Image, Space, Reference). Opening or Closing changes only what is drawn inside the Resource's rect — its Title or its content — and never its size or anything's position.
- An Ur Resource offers no Open.

## Decisions

- **Map entry.** `{ x, y, open?, size?, shape? }`. The Open/Closed discriminated union and `openSize` are removed.
  - `size` is optional; the application default is the Closed Size (260×146), as `shape` defaults to the rectangle and `headShape` to the arrow.
  - `open` is optional; the application default is Closed. Intake refuses `open: true` on an Ur Resource with a named code.
- **Fixtures and seeds roll forward in the same change, preserving what is drawn.** An Open entry's `openSize` becomes its `size`; a Closed entry drops its remembered `openSize` (it was drawn at the Closed Size, so it stays so). Nothing changes on screen.
- **One floor for every kind:** the Closed Size, Open or Closed. Content adapts to the rect it is given (a small Open document scrolls, an image scales, an embedded Map fits). Kind-specific Open minimums (the Space Resource's) and the first-Open size (default Open Size, an Image's natural size, a Reference's Target geometry) retire.
- **Retired:** Open Size, Open Size surviving Close, the magnetic Close, displacement on Open and Close, growth measured against the Closed Size, and Close's reclaim on remove/delete.
- **Resize still displaces.** A Resize moves the Resources its growth passes, as one Edit when the drag ends, by the same one-axis displacement rule the Open Resize uses today, measured from the Resource's size before the drag.
- **Edit is unchanged:** Edit on a Closed Resource opens it before placing the caret (ADR 0064). Opening it changes no size.
- **The resize control is unchanged** — the existing bottom-right control, its look and behaviour. What changes is when it is offered: on a **selected** Resource, Open or Closed, any kind, wherever its Map may be authored. It is no longer gated on Open.
- **Shape border.** A selected Resource drawn in a Shape other than the rectangle also draws a thin rectangular border around its rect, so the resize control sits on that border's corner. The rectangle needs none; its edge is the border.
- **Edge handles are not touched.** No change to connection handles, their positions, or Edge attachment.
- **Presenting is unchanged.**

## Testing Decisions

- Drive the highest existing seam: intake (`loadSpace`), Space Authoring's completed Edits, the projection, the front's rendering test, and Playwright / Ladle for what only layout can show.
- Intake: an entry with neither `open` nor `size` loads Closed at the Closed Size; `size` below the floor is refused; `open: true` on an Ur Resource is refused with the named code; `openSize` is refused (strict schema).
- Edits: Open and Close change only `open` (positions and sizes byte-identical); Resize changes `size` Open or Closed and displaces as today; Resize below the floor is refused or clamped as today's floor rule does.
- Round trip: export/import preserves `open`, `size` and `shape`, including their absence.
- Browser: a Closed Resource can be selected and resized and stays Closed; Opening a resized Resource keeps its size; a selected Shape draws the rectangular border with the resize control on its corner; an unselected Resource shows no resize control.
- Stories: ADR 0052 Ladle and application proofs follow any renamed or new claim.

## Docs

- A new ADR (next free number) recording that size and Open/Closed are independent. It refines or supersedes, in their status blocks, what it retires: ADR 0064's Open/Close geometry, 0066 (Open Size survives Closing, magnetic Close), 0084/0093 (displacement on Open/Close), 0106's first Open at natural size, 0114's first Open Size and resize floor, and 0121's Open wording. Those ADRs are on `main`, so they are not edited in place beyond status blocks.
- `docs/agents/maps-and-graphs.md` §6 (R37–R44) and §7 rewritten in place to the new rules, rejected options updated; CONTEXT.md (Open, Closed Size, Open Size, Resize) follows.

## Out of Scope

- Any change to Edge handles, Edge attachment, or the resize control's appearance.
- Proportion locking, side handles, or a bounding-box resizer.
- New Shapes; Undo; Auto-arrange.
