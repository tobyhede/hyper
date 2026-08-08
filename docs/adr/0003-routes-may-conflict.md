# Routes are independent and their orders may conflict

Status: accepted
Refined by: 0012, 0032, 0040, 0041
Related: 0022, 0026

**Routes** are independent narratives over the same cards. Two routes may visit the same pair of cards in opposite orders. (This ADR originally also allowed a single route to revisit a card; ADR 0012 removed that — a route now visits each card at most once, and a return is expressed with an alias. The cross-route conflict below is unchanged.) This means the combined step-order across all of a space's routes can contain a **cycle**, and that is legal — a space is not required to have a consistent global ordering of its cards.

We chose this over the stricter alternative (routes must agree on the order of any card they share, so the combined order is always acyclic). The strict rule would guarantee that every route is always cleanly renderable together, but it would forbid legitimate content — e.g. two audiences who genuinely traverse the same material in opposite directions — and push that constraint onto authors. Keeping the space permissive puts the burden where it belongs: on the presentation. How a given view copes when it cannot draw a conflicting set of routes cleanly is a rendering decision, deliberately left out of the domain model.

The cost we accept: no code may assume a space has a single coherent left-to-right ordering of its cards, and views that draw multiple routes must be prepared for conflicting ones.
