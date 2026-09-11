# 04 — An Edge attaches on the side that faces its neighbour

Status: done
Blocked by: 03

**What to build:** Draw an Edge between the sides of two Things that actually face each other, instead of always leaving the right and entering the left. An author who drags a Thing above its neighbour sees the Edge move to the top and bottom edges, and the Edge follows the drag rather than snapping at release.

Authoring is untouched. The four Active-Graph-coloured handles remain the gesture, the connection preview still leaves the handle under the pointer, and the drop, reconnection and deletion rules are unchanged — this ticket changes how an authored Edge is drawn, not how one is made.

ADR 0087 decided it. Land it as **two commits**: first move attachment onto the four anchors, then delete the per-Graph port family once nothing reads it.

Anchors must render even where the authoring controls do not — an embedded Diagram draws Edges with `readOnly` and `connectionAuthoringEnabled: false` — so withhold the affordance with `opacity`, never `display: none`. The side is chosen in the edge component from live store positions, over a pure two-rect rule tested in the node environment. A self-Edge takes a fixed loop before the general rule.

- [x] An Edge leaves and enters on the sides facing the other Thing, and is correct for a large Open Thing beside a collapsed one.
- [x] The attachment follows a drag continuously and does not freeze while the pointer is down.
- [x] A self-Edge draws a visible loop rather than a degenerate or missing path.
- [x] Several Graphs crossing one pair of Things converge on one anchor and are told apart by colour and Active Graph emphasis alone. ADR 0087 accepts this; do not add fanning.
- [x] The Edge-authoring gesture is unchanged: handles, preview line, drop classification, reconnection, deletion.
- [x] A Selected Edge draws its controls on the new geometry.
- [x] React Flow reports no #008 warnings, including on a second connection drawn in the same session.
- [x] `buildThingHandles`, `filterHandlesByGraphs`, `resolveHandles`, `GraphRenderHandleRef` and `LayoutStrategyEdge`'s `sourceHandle`/`targetHandle` are gone, in the second commit.
- [x] Ladle and application evidence per ADR 0052, plus E2E covering the facing-side change, a self-Edge and a multi-Graph pair.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green.

## Answer

Built as ADR 0087 states it, in the two commits the ticket asks for.

**The rule is pure and it reads the gap, not the centres.** `packages/react-flow-adapter/src/edge-attachment.ts` is one function from two rects to a side, tested in the node environment. It picks the axis by the gap between the rects — positive when they are clear of each other, negative by the overlap when they are not — rather than by the vector between their middles. The centre vector fails the ticket's own criterion: a tall Open Thing with a collapsed one by its lower edge is a pair that overlaps vertically and is clear horizontally, which an author reads as side by side, and whose centre vector is vertical. `anchorPoint` reads `AUTHORING_HANDLE_DIAMETER`, the constant `declaredHandles` declares the handle rects from, so a drawn Edge lands on the anchor that was declared rather than near it.

**Only the reading of live positions is React's.** `useEdgeAttachment` asks React Flow's store for the two Things and hands the rects to the rule. It cannot read its own props: those answer the question for the handles the projection named, and the projection does not run again during a drag. `RoutedEdge` splits into `RoutedEdgePath`, the curve alone, and `useRoutedEdgeGeometry`, which answers the path and the midpoint together — so `AuthorableEdge` composes the path rather than the whole Edge and a selected Edge resolves its attachment once instead of once per layer.

**The four handles now render on every Thing.** That is forced rather than chosen, and by more than the embedded-Diagram case the ADR names: `getEdgePosition` returns null and React Flow draws *no Edge at all* for a Thing whose handles it cannot resolve. So the anchor and the affordance separate — `data-connection-authoring` on `.rf-thing-node__inner` says which a Thing is offering, every reveal rule in `styles.css` is conditioned on it, and a Thing that is not authorable carries four unlabelled `aria-hidden` anchors no drag can begin or end at.

**An Edge names no handle.** `getHandle` in `@xyflow/system` resolves an unnamed handle to the first bound of that kind, with no warning, so there was no need to invent a side for the projection to name — and naming one would have made it React Flow's answer rather than the Edge's. `GraphRenderEdge` and `LayoutStrategyEdge` lose their two handle fields with it, and the port family goes whole: `buildThingHandles`, `filterHandlesByGraphs`, `filterHandlesByGraph`, `inHandleId`, `outHandleId`, `GraphRenderHandleRef`, `ThingHandleSet`, `resolveHandles`, `ThingHandle`, `GRAPH_PORT_DIAMETER`, the `sourceHandles`/`targetHandles` on `ThingNodeData`, the `.rf-thing-node__port` block, and `projectThingNodes`' `colors` and `nodeHeight` arguments, which had no reader left once the anchors stopped being per-Graph and coloured one by one.

**What the invariants became.** The property tests that asserted an Edge names a handle existing on the node it points at now assert that every Thing an Edge reaches declares four anchors of each role — the condition that actually decides whether the Edge is drawn, once nothing names a handle. The tie-break test between a non-incident Graph anchor and an authoring handle is gone with the thing it was about; handle array order no longer decides anything, because there is only one family left.

`packages/app/e2e/edge-attachment.spec.ts` carries the browser evidence: the facing sides at rest and after a Thing is moved below its neighbour, the attachment read **mid-gesture with the pointer still down**, a self-Edge drawn and checked for a real loop and no `NaN`, three Graphs over one pair of Things coinciding on the anchors and keeping their three colours — ADR 0087's stated cost, asserted rather than discovered — and a selected Edge's controls landing on the midpoint of the path it moved to. The #008 guard is the existing `editing.spec.ts` test, "a second connection drawn in the same session resolves its handles", which four fixed anchors satisfy without the every-Graph declaration loop that used to be needed for it.
