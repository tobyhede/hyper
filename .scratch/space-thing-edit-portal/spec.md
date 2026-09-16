# Space Thing Edit Portal

An Open Space Thing is a window onto its target Space. The embed is a
**sub-flow** on the containing canvas — one React Flow, one viewport
(ADR 0068's compound canvas). Read stays inert. Enter is still its own
instance and camera.

Tickets `01`–`03` shipped the Dock boundary, durable framing, and the shared
production story. Ticket `04` is Edit on that decided model: handles, framing,
clip. It does not reopen a nested instance.

## Product rule

In **Read**, the embedding is a picture. Dragging any exposed surface moves the
containing Space Thing. Anchors exist so Edges can attach (ADR 0087); they are
not affordances.

In **Edit**, the embedding is authorable through the same production Thing:

- hover handles match the host canvas and author the **Graph that Space Thing
  is showing** (the Graph it stores), not the host canvas Graph
- they do not complete a cross-Space Edge on the containing canvas (ADR 0040)
- wheel zoom and empty-area pan author **framing** on the Space Thing (`02`)
  — a projection of authored coordinates into the window, not a second
  viewport transform. Explicit Edit on that Space Thing is what enables them.
- a Thing's flow-pixel size does not change with portal zoom; the host
  viewport is the only optical scale, so titles follow browser-canvas zoom
- a Thing that leaves the window is clipped by the window; it does not paint
  on the containing canvas
- Thing, Diagram, Graph and Edge edits write the target Space through the
  existing Space Authoring

**Done** returns to Read and keeps the current Diagram, Graph and framing.
**Enter** is exempt: the target becomes the browser canvas, with a camera that
does not inherit the source Thing's rectangle (ticket `02`, ADR 0068).

## Already decided

- Compound canvas: `parentId`, one store, one viewport. React Flow's documented
  nest ([sub-flows](https://reactflow.dev/learn/layouting/sub-flows);
  `.scratch/react-flow-guidance/findings.md` §8). Children are not DOM
  children. There is no per-group camera.
- Nested `<ReactFlow>` inside the Space Thing is the ADR 0068 counterfactual
  and is closed unless a later ticket overturns it.
- One Dock, no second command surface (`01`).
- Framing lives on the Space Thing document, not on the target Diagram (`02`).
- Ladle mounts the production portal (`03`).
- Cross-Space Edges stay refused. The library will offer them; the application
  does not (`findings.md` §8.3).
- A Space Thing drawn *inside* an embedding is content of the window already
  in Edit, not a second camera. React Flow has no per-group camera; nested
  framing is a new product, not leftover `04` work.

## Tickets

| # | | Status |
| --- | --- | --- |
| [01](issues/01-production-read-edit-boundary.md) | Production Read/Edit Dock boundary | resolved |
| [02](issues/02-durable-framing-and-seamless-enter-return.md) | Durable framing and Enter/Return | resolved |
| [03](issues/03-share-the-production-portal-with-ladle.md) | Share the production portal with Ladle | resolved |
| [04](issues/04-edit-canvas-is-the-host-canvas.md) | Edit the sub-flow; no second camera | resolved |

## Avoid

- A second Thing component, or a story-only canvas that only looks like one.
- A second viewport, `--embed-zoom`, or stretched `width`/`height` to imitate
  host-canvas magnification.
- `extent: 'parent'` as a substitute for a camera — React Flow applies a
  numeric extent in `adoptUserNodes`, which redraws authored placement
  (`embedded-diagram.ts` already refuses it for that reason).
- An ADR for this composition. The direction is already in ADR 0068; `04` is
  implementation on it.
