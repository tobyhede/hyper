# Route authoring uses spatial handles coloured as the active Route

Status: accepted
Supersedes: 0021
Refined by: 0040, 0041
Related: 0025, 0026, 0032

An author draws an Edge by dragging from one of four small circular handles on
a card, one centered on each side, to a target handle on a card. The handles
are route-independent: the active Route is the Edge's write target. They are
coloured as that Route so the result of the gesture is visible before the drag
begins. In a route-less Space they use the first palette colour, which the
lazily minted `Route 1` then receives.

Source handles appear on a hovered or selected card. During a connection drag,
target handles appear on every card, including the source card because
self-edges are legal (ADR 0032). The in-progress connection uses the active
Route's colour and an arrowhead. On success the target becomes selected, so the
author can continue drawing from it. Existing Edges remain coloured lines;
their rendering endpoints are not permanent visible controls.

The side chosen is interaction geometry, not authored data. A completed Edge
stores only `{from, to}`, and its renderer remains free to attach it to the
facing card borders. Several spatial handles express one operation conveniently
without introducing route-specific handles or attachment semantics into the
domain.

Dragging to empty canvas normally cancels. Holding Option on macOS or Alt on
other platforms makes that gesture an explicit new-card operation: a
translucent preview of the next neutrally named `Card N` appears centered at
the eventual position, and release creates the Markdown Card, its position,
and the Edge atomically. Without a Route, the same completed Edit mints and
activates `Route 1`. Cancelled gestures change nothing.

## What survives from ADR 0021

React Flow remains the input device: a completed connection mutates the active
Route, and modifier-drop creates the target Card before adding the Edge. The
gesture is available in an Algorithmic View because a successful Edit converts
that View into a positioned Layout (ADR 0025). Exact duplicate Edges are no-ops,
and every successful completed gesture persists one complete Space snapshot.

What does not survive is the literal single neutral handle and default
create-on-empty-drop. A single handle made an arbitrary side privileged on a
spatial canvas, while a visually neutral control hid which Route would receive
the Edge. Default empty-drop also made an ordinary cancelled connection create
authored content.

## The cost we accept

Four handles per hovered card and temporary handles across all targets are more
visual machinery than one invisible connection surface. They buy explicit
direction, spatially convenient grabbing, and a visible active-Route write
target. The modifier makes new-card creation less discoverable, but prevents a
missed target from becoming an irreversible structural Edit.
