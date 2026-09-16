# 04 — Edit the sub-flow, do not give it a second camera

**What to build:** Edit on the existing compound canvas. Same production Thing,
hover handles that author the target Graph, portal pan/zoom as framing over
authored coordinates, clip to the Space Thing window. No nested
`<ReactFlow>`, no `--embed-zoom`, no third zoom.

**Blocked by:** None.

**Status:** resolved

**Decided:** stay on the sub-flow. That is ADR 0068's compound-canvas direction
and what the tree already implements. A nested instance is the counterfactual
that ticket left standing; this ticket does not reopen it.

**Why:** Ticket `01` asked for pan, zoom and Graph authoring on “the real
embedded canvas” and resolved. The implementation faked a second camera on
React Flow's one viewport (scaled `width`/`height`, then `--embed-zoom`).
Observed in Edit: no hover handles; titles that do not follow the host
viewport; zoom-out painting Things on the containing canvas. Those are defects
on the decided model, not grounds to pick a new one.

The spec is `.scratch/space-thing-edit-portal/spec.md`.

## Constraint

React Flow's nest is `parentId`, one store, one viewport
([sub-flows](https://reactflow.dev/learn/layouting/sub-flows);
`.scratch/react-flow-guidance/findings.md` §8). There is no per-group camera.
Children are not DOM children and may paint outside the parent. Cross-boundary
Edges are offered; this application refuses them (ADR 0040).

`extent: 'parent'` is a drag fence. React Flow applies a numeric extent in
`adoptUserNodes` and that rewrites authored placement — already refused in
`embedded-diagram.ts`. It is not a camera.

Portal wheel/pan authors framing on the Space Thing (`02`). That is a
projection of authored positions into the window, not a second
`translate + scale` on a viewport. The **host** viewport is the only optical
scale: titles follow browser-canvas zoom. Do not multiply a Thing's box to
imitate magnification.

## Build

- [x] Hovering an embedded Thing in Edit reveals the same connection handles as
      the host canvas; they author the Graph that Space Thing is showing, not
      a cross-Space Edge.
- [x] Portal pan/zoom writes framing (`02`) and does not stretch `width` /
      `height` or introduce a CSS scale token.
- [x] A Thing outside the window is clipped to it. Zoom in until nothing is
      visible, then out: Things appear at the window, never on the containing
      canvas, and never animate in from outside the Space Thing.
- [x] Read is unchanged: inert embedding, no handle affordance, drag moves the
      containing Space Thing.
- [x] Enter/Return and stored framing (`02`) still hold.
- [x] `--embed-zoom` and any optical-scale rule on `.rf-thing-node__inner` are
      removed if they are still in the tree.
- [x] Application and Ladle proofs cover handle reveal, clip-after-zoom-out,
      and that portal zoom does not change a Thing's flow-pixel size. Do not
      accept a screenshot of the resting Edit state as that proof.

## Avoid

- A nested `<ReactFlow>` inside the Space Thing. Overturning the compound
  canvas is a new ticket, not a side effect of this one.
- A second Thing component.
- Treating the current `--embed-zoom` + `clipPath` + `transition: none` tree as
  having answered this ticket.
- Re-opening `01`–`03`. Their Dock, framing and story work stand.

## Answer

Edit stays on the compound canvas: same production Thing, framing as a
projection into the window, clip to that window, no nested `<ReactFlow>`.
Connecting two Things in Edit writes an Edge on the Graph that Space Thing
stores and shows. Host Edge Authoring is not composed over the embed.

A Space Thing is a window onto its target Space. Explicit Edit on that Thing
is what enables pan, zoom and authoring inside the window. A Space Thing that
appears inside that window does not get its own framing camera.

## Comments

Handle reveal, framing-without-stretch, and clip-after-zoom-out are the proofs
this ticket asked for. Connecting two embedded Things completes
`connected-things` on the target Space through `completeInDiagram`, writing the
Graph the Space Thing is showing. Host Edge Authoring is still not composed
over the embed; the host React Flow handlers route an `embedded:…` pair to that
completion and refuse a mixed pair (ADR 0040). `clip-path: inset(0)` clips the
handle centres on the Thing rim; unclipped sides keep
`AUTHORING_HANDLE_DIAMETER / 2` of slack (`embedded-diagram.test.ts`). Portal
Edit takes `nopan` and not `nowheel` (ADR 0064).
