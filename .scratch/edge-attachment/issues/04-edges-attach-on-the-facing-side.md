# 04 — An Edge attaches on the side that faces its neighbour

Status: ready-for-agent
Blocked by: 03

**What to build:** Draw an Edge between the sides of two Things that actually face each other, instead of always leaving the right and entering the left. An author who drags a Thing above its neighbour sees the Edge move to the top and bottom edges, and the Edge follows the drag rather than snapping at release.

Authoring is untouched. The four Active-Graph-coloured handles remain the gesture, the connection preview still leaves the handle under the pointer, and the drop, reconnection and deletion rules are unchanged — this ticket changes how an authored Edge is drawn, not how one is made.

ADR 0087 decided it. Land it as **two commits**: first move attachment onto the four anchors, then delete the per-Graph port family once nothing reads it.

Anchors must render even where the authoring controls do not — an embedded Diagram draws Edges with `readOnly` and `connectionAuthoringEnabled: false` — so withhold the affordance with `opacity`, never `display: none`. The side is chosen in the edge component from live store positions, over a pure two-rect rule tested in the node environment. A self-Edge takes a fixed loop before the general rule.

- [ ] An Edge leaves and enters on the sides facing the other Thing, and is correct for a large Open Thing beside a collapsed one.
- [ ] The attachment follows a drag continuously and does not freeze while the pointer is down.
- [ ] A self-Edge draws a visible loop rather than a degenerate or missing path.
- [ ] Several Graphs crossing one pair of Things converge on one anchor and are told apart by colour and Active Graph emphasis alone. ADR 0087 accepts this; do not add fanning.
- [ ] The Edge-authoring gesture is unchanged: handles, preview line, drop classification, reconnection, deletion.
- [ ] A Selected Edge draws its controls on the new geometry.
- [ ] React Flow reports no #008 warnings, including on a second connection drawn in the same session.
- [ ] `buildThingHandles`, `filterHandlesByGraphs`, `resolveHandles`, `GraphRenderHandleRef` and `LayoutStrategyEdge`'s `sourceHandle`/`targetHandle` are gone, in the second commit.
- [ ] Ladle and application evidence per ADR 0052, plus E2E covering the facing-side change, a self-Edge and a multi-Graph pair.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.
