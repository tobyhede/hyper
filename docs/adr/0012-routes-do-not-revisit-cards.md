# A route does not revisit a card; return via an alias

Status: superseded
Superseded by: 0032
Refines: 0003
Refined by: 0023
Related: 0009

A **route** visits each card at most once. Its steps must target distinct cards; a space whose routes repeat a card fails to load (`loadSpace` → `route-revisits-card`).

This narrows ADR 0003, which permitted a route to revisit a card. Everything else in 0003 stands: two *different* routes may still disagree on the order of shared cards, so the combined step-order across a space can still contain a cycle. What is removed is the one kind of cycle a *single* route can create on its own — a self-return.

## Why

A revisit is the one shape a single route can produce that no left-to-right layout renders cleanly. The graph draws a card once, as one node; a step that returns to it is a backward edge, which cannot be a forward line while keeping one node per card. Rendering it legibly means either routing it as a channel looping around the cards (`layout-seam/03`) or unrolling the revisit into duplicate nodes — both real work, and both in service of a gesture we already have a better word for.

Because **an alias** (ADR 0009) already expresses "return to earlier content": a distinct card, with its own title and position, showing another card's content with a single source of truth. The demo used one for exactly this — `model-recap`, "Recap: the data model", an alias of the model card — precisely so the route could move *forward* to a labelled return instead of bending back. A literal revisit buys the same narrative intent and pays for it with a backward edge. If the alias covers the need, the revisit is all cost and no expressive gain.

So the model steers the return through the alias and forbids the revisit, and single-route graphs become acyclic by construction.

## What we accept

- **This reverses a clause of 0003.** 0003 chose to keep the space permissive and push conflict-handling onto the view. We keep that for *cross-route* order conflicts; we do not keep it for self-return, because the alias is a first-class, better-rendering way to say the same thing. The permissiveness 0003 was protecting — "two audiences traverse the same material in opposite directions" — is a two-*route* case and is untouched.
- **An alias must always be an acceptable substitute for a revisit.** If a future need genuinely requires a route to return to the *same* node (not an alias of it), this ADR is what to reopen.
- **The presentation deck is unaffected.** A deck is a linear list of steps; showing an alias slide is the same as showing any other. The restriction is about the spatial graph, where a revisit is a backward edge.
- **`layout-seam/03` is not wasted.** Orthogonal edge routing still improves every forward edge, and a *cross-route* order conflict can still produce a backward edge that it renders as a channel. It simply stops being the thing holding up a self-return.
