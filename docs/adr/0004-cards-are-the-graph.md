# Cards are the graph; there is no placement layer

Edges connect **cards** and route steps target **cards**, both by card id. There is no separate node or placement entity between a card and its position in the graph: a card occupies exactly one position, and the authored graph is cards, edges, and routes over those cards.

We removed the earlier `nodes` layer (a 1:1 indirection of `{ id, cardId, position }` that edges and steps referenced instead of cards). It bought nothing — every card had exactly one node — and it contradicted the glossary, where **Node** sits under Card's _Avoid_. Authored positions went with it: arrangement is a **Layout** concern (ADR 0002), not a field on the content unit, and ELK computes positions anyway.

This deliberately removes the one thing the node layer allowed: placing the same card at two graph positions. Content that needs to recur has exactly two routes to it, neither an authored duplicate placement:

- An **Alias** — a distinct card id that shows another card. This is how the same content appears at a second position. (The Alias card kind is a later change; until it lands, the authored graph cannot reuse a card, which is acceptable because nothing yet needs to.)
- A route that revisits the same card id (`C … C`) — a genuine revisit, and a view-level cycle the presentation copes with (ADR 0003). The layout never silently unrolls a revisit into duplicate boxes; if an author wants a fresh forward-readable box, they route through an alias.

The cost we accept: a future architecture pass that sees "a card cannot be reused" must not answer it by reintroducing a node/placement array. Reuse belongs to Alias, redraw-vs-loop-back belongs to the author, and neither is a placement layer.
