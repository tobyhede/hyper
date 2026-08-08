# Routes are a space's only structure; authored edges are deleted

Status: accepted
Supersedes: none
Refines: 0003
Refined by: 0015, 0040, 0041
Related: 0023

A space is **cards and routes**. There is no separately authored connection between two cards. The manifest's `edges` array — each entry `{ id, source, target, kind: 'sequence' | 'reference' }` — is removed from the schema, along with both kinds.

## Why

Nothing consumed them. `validateReferences` checked that each edge's `source` and `target` resolved to real cards, and that was the only code in the repo that read `manifest.edges`. They were never laid out, never drawn, never navigated, never indexed. They were validated for their own sake.

Worse, `sequence` duplicated Route. The bundled demo authored five sequence edges — `intro→problem`, `problem→model`, `model→rendering`, `rendering→routes`, `routes→demo` — which is the "Main walkthrough" route's step order restated verbatim. A `sequence` edge is a degenerate two-card route that cannot be named, coloured, ordered beyond a pair, or presented. Two ways to say the same thing, one of them strictly weaker.

The glossary was already carrying the strain. Route's `_Avoid_` list read "sequence (that is an edge kind)" — a domain term defending itself against a near-synonym that existed only because of this array.

`reference` was the one genuinely distinct idea: an association between cards that makes no ordering claim, which a Route cannot express. It is deleted with the rest rather than kept, because it was unimplemented, undrawn, and used once in the demo on a pair of cards the main route already connected. Carrying dead schema on the chance it is wanted later costs more than re-adding it if it is. If it returns it should be named for what it is, not as a kind of edge.

## Consequences

A space's shape is now entirely the routes laid across its cards. Any structure an author wants to assert has to be a route, and a two-card route is the honest way to say what a sequence edge said.

**"Edge" stops being a domain term.** It stays in `CONTEXT.md` under a render-layer section, redefined as React Flow's concept: the drawn line between two nodes, one per route step transition. We build against React Flow directly and need to speak its vocabulary precisely; that is different from the domain containing the concept.

`ReferenceErrorKind` loses `unresolved-edge-source` and `unresolved-edge-target`.

This refines ADR 0003, which established that routes are independent narratives whose orders may conflict, by making them the *only* structure — there is no second, authored ordering that could agree or disagree with them.

ADR 0040 later relocates that structure without adding another kind: Routes are owned by Layouts rather than stored as peers under the Space. Within a Layout they remain the only authored graph structure over its Cards.

## The cost we accept

A future review will note that a graph library is being fed a graph with no authored edges, and suggest adding them back for a "structural layer" beneath the routes. That suggestion is this ADR. The structural layer it imagines was present for the entire life of the prototype, drawn nothing, and duplicated the routes.
