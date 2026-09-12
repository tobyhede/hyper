# An Edge attaches to the anchor that faces its neighbour

Status: accepted
Refines: 0033, 0086
Refined by: 0089
Related: 0021, 0032, 0040, 0041, 0045, 0064, 0066, 0083, 0084

A Thing has **four Edge anchors**, one on each side, and they are the same four handles the authoring gesture already uses. An Edge attaches to the anchor on the side that faces the other Thing. The side is decided while the Edge is drawn, from where the two Things are at that moment. Nothing about it is stored, authored, or carried in the document.

This answers the question ADR 0086 left open. Before it, every Edge left a Thing's right side and entered the next one's left, and that had exactly one cause: `port.side === 'in' ? 'WEST' : 'EAST'`, mapping a handle to an elkjs port side. elkjs left, and the sentence explaining the geometry left with it.

## The per-Graph port family goes

A Thing carried an invisible `<graphId>::in` on its left and `<graphId>::out` on its right, one pair for every Graph, spread evenly down the side. That family existed because elkjs needed ports to route edges through. ADR 0045 justified its **ids** on a separate ground — React Flow's warning #008, which requires handles of one kind on a node to be distinguishable — and that ground is satisfied just as well by four anchors named for their sides.

So the family has no remaining job. `buildThingHandles`, `filterHandlesByGraphs`, `resolveHandles` and `GraphRenderHandleRef` go, and with them `sourceHandle` and `targetHandle` on `LayoutStrategyEdge`, which code has written and nothing has read since ADR 0086.

## An anchor is not an affordance

The four handles do two jobs that this decision separates.

As an **anchor** a handle is where an Edge meets a Thing. Anchors always render. This is forced rather than chosen: a Thing inside a Space Thing's embedded Diagram draws Edges while `readOnly` and `connectionAuthoringEnabled: false` withhold the authoring controls, and today the per-Graph ports are what serve it. `rendering.md`'s standing rule applies unchanged — hide a handle with `opacity` or `visibility`, never with `display: none`, because React Flow measures it.

As an **affordance** a handle is where an author begins or ends drawing. The colour of the Active Graph, the pointer targets, and the appearing and disappearing during a connection drag are that layer, drawn over the anchors, and they stay exactly as ADR 0033 describes them. ADR 0033 said the four handles are Graph-independent and that the side is interaction geometry rather than something authored. Both sentences survive. What this adds is that Edges now land on them.

## The side is chosen while drawing, not while projecting

An anchor belongs to one Thing. The **choice** between four anchors depends on two. Something therefore has to decide per pair, and where that happens is the one genuine trade in this decision.

The projection is the tempting home, because it is pure and tested in Node. It is the wrong one. **The projection does not run again during a drag** — the render adapter splices React Flow's live node positions into the published projection and leaves the Edges as they were, and the Edit only lands when the gesture settles. A side chosen in the projection is therefore correct only after release. The Edge would stay attached while a Thing is dragged around its neighbour, and would attach to the far side, crossing the Thing, until the author let go. That is the defect this decision exists to remove, reappearing at a smaller scale.

So a small edge component decides, reading both Things' positions from React Flow's store. The **rule** stays pure: one function from two rects to a side, living beside the domain and tested in the node environment. Only the reading of live positions is React's. This is the functional core and imperative shell the repository already asks for, with the drag loop as the shell.

Declared handle geometry is untouched by this. The component reads the anchor positions React Flow built from `node.handles`, so nothing is measured from the DOM and `useUpdateNodeInternals` stays forbidden.

## Four anchors, not a sliding one

React Flow's floating-edge example slides the endpoint continuously around a node's perimeter. We take the four-anchor form instead, and the reason is not simplicity alone.

A continuous anchor is a property of a **pair**, so it cannot be expressed as a declared handle at all — a Thing's attachment point faces different directions for different neighbours. Four anchors are properties of one Thing, so they remain ordinary declared handles and the declared-never-remeasured rule keeps holding without argument.

The example's own geometry is also wrong for this canvas. It computes both node centres from the *intersection* node's half-width and half-height, which is correct only while all nodes are the same size. A Thing is 260×146 collapsed, 560×420 open, and 960×720 as an open Space Thing, and ADR 0084 moves neighbours when one opens. Large beside small is the normal state of a Diagram someone is reading, not an edge case.

## A self-Edge is a special case, taken first

ADR 0032 makes cycles legal and a Graph may hold an Edge from a Thing to itself. The facing-side rule divides by the vector between two centres, which is zero for one Thing, and React Flow draws a `NaN` path as nothing at all. A self-Edge therefore gets a fixed loop and never enters the general rule. This is three lines before the geometry, not a correction after it.

## What it costs

**Several Graphs between one pair of Things now draw one line over another.** Each Graph used to get its own port at its own offset down the side, and that is what kept them apart. Four anchors are Graph-independent, so every Graph joining the same two Things resolves to the same point. Colour and the Active Graph's emphasis are all that separate them, and a Diagram overview drawing every Graph at once is exactly where this shows.

This is accepted deliberately rather than overlooked. The alternative — fanning parallel Edges by curvature, one offset per Edge between a pair — is more code than the port family it would replace, and it answers a legibility question that `.scratch/multiple-routes/findings.md` already measured and found bounded: colour stops separating Graphs at about four regardless. If the overview needs fanning, it is a decision to take against that finding, with the overview in front of you, and not a rule to build in now.

**One store subscription is added per Edge.** The edge component reads two node positions. On a Diagram drawing every Graph at once that is the many-Edges case. It buys a side that is right during the drag rather than after it, which is the whole point.

## What this does not touch

The authoring gesture is unchanged: four handles coloured as the Active Graph, the connection line leaving the handle under the pointer, the drop classification, reconnection and deletion. `ConnectionMode` is not changed, because what connections are legal is an authoring question and has no business riding along in a rendering change.

Nothing in the stored document changes. Placement is a Thing and its position, as it was. Which Graphs a Diagram owns, what an Edge is, and how a Graph is traversed are all untouched, and `CONTEXT.md` needs no new word — its render-layer **Handle** entry already says the side is interaction geometry rather than a rule the model obeys.
