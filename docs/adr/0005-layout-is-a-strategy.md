# A layout is a strategy; there is no arranged-result type

A **Layout** is a named strategy for arranging a space's cards — how they are organised and positioned. It is not a stored arrangement, and applying one does not produce a separate entity: the result is the cards, ports and edges carrying positions.

We checked this against the two libraries the renderer is built on, and both model it the same way. ELK keeps geometry as optional fields on the graph elements themselves — `ElkShape` has `x?`/`y?`/`width?`/`height?`, and `ElkNode` and `ElkPort` extend it — so `elk.layout(graph)` takes an `ElkNode` and returns the same `ElkNode` with those fields populated; the strategy is expressed as `LayoutOptions`, a plain string map attachable at any level of the hierarchy. React Flow's `NodeBase` carries `position` as a required field and has no layout concept at all. Neither library has a Layout entity, and inventing one would place a type between us and both of them.

We rejected the tidier-sounding alternative of a `Layout` (the specification) plus an `Arrangement` (the resolved geometry). It buys nothing — every consumer wants the positions — and adds a translation step at exactly the seam we are trying to keep thin. `CONTEXT.md` lists "arrangement" under Layout's _Avoid_ for this reason.

Which cards a layout arranges belongs to the **View**, not the Layout. ELK's `layoutOptions` has no notion of membership; which nodes exist is decided by whoever builds the graph before layout runs. Routes are part of that structure — they contribute the ports and rail edges the layout consumes — and are not a thing that multiplies layouts. Many routes, one layout.

This refines ADR 0002, which established that a layout arranges and a view renders, by fixing where the boundary falls and what crosses it.

The cost we accept: "layout" names a strategy rather than a noun you can point at on screen, which reads oddly until you notice both libraries do the same. And because different kinds carry different parameters — ELK options for the layered graph, a card→position map for a hand-placed one — a Layout is a kind plus its parameters, so no code may assume those parameters have a single shape.
