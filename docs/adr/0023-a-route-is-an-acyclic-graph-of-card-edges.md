# A route is an acyclic graph of card edges, not a step sequence

Status: accepted
Refines: 0012
Related: 0007, 0009, 0021

A route's structure is a set of directed **edges** between cards, and it must be
acyclic. An author draws an edge from one card to another (ADR 0021) and the route
stores those edges. A card may have several edges out — a fork — and several in —
a merge; what it may not do is close a cycle. `loadSpace` rejects a route whose
edges contain one.

This replaces the step sequence. A route was an ordered list of card targets,
`[A, B, C]`, whose connections were implied by adjacency, so it could only ever be
a single line. An edge list stores the connections directly, `[(A→B), (B→C)]`, and
can express what a line cannot: a branch. That is the point — the authoring
gesture is "draw an edge," and free connection naturally produces forks and
merges, so the stored shape has to be a graph, not a line.

## Acyclicity is the only rule

Nothing else constrains the graph. A route need not be connected — two disjoint
components are valid — and need not have a single root or single sink; forks and
merges give it many of both. The sole structural rule is no cycle.

This restraint is deliberate, and it follows a principle the whole authoring model
now rests on: **presentation is a display problem and must not constrain the
domain.** The temptation is to require a route be connected and single-entry so
that it "makes a clean deck" — but that is importing a display concern into the
structure. A shape with no obvious linearization is presentation's problem to
solve when presentation is built, not a shape the domain should forbid. The domain
records what the author drew; how a display walks it is the display's business.
(Even acyclicity is kept for a *domain* reason — return-via-alias, ADR 0009 — not a
display one; see the deferred door.)

## What acyclic keeps

ADR 0012 forbade a route revisiting a card and made single-route graphs acyclic
*by construction* — a step-line cannot repeat a card. An edge list can (A→B, B→A),
so the guarantee moves from construction to **validation**: the graph is still
acyclic and `loadSpace` still rejects a revisit, but now by checking for a cycle
rather than by the representation making one impossible. 0012's "each card at most
once" survives as a *structural* fact — a card is one node — and this refines
0012, it does not supersede it. What acyclicity does *not* by itself guarantee is
that a *deck* shows each card once: a merge (B→D, C→D) reaches D two ways, so
dedup at presentation is a presentation concern, deferred below with presentation
itself.

Alias (ADR 0009) keeps its job for the same reason. Because a route still cannot
loop back, returning to earlier content downstream is still done by stepping to an
**alias** of a card, not the card itself. Allowing cycles would have taken alias's
"return without revisiting" rationale away; acyclic keeps the model coherent.

## The deferred door

Cycles are left out deliberately, and this is the ADR to reopen if they are
wanted — which is exactly the reopening 0012 already named, "if a future need
genuinely requires a route to return to the same node." Acyclic is the
conservative start: it unlocks the branching the edge list is for while keeping
presentation traversal terminating and the no-revisit / alias model intact.
Allowing cycles is the larger change — it supersedes 0012, hollows out alias, and
forces presentation to cope with loops — so it waits until something needs it.

## What this does not decide

How a branching route becomes an ordered deck — the **linearization** question. A
line has one order; a graph has many, and picking one — an authored spine, a
traversal, a presenter choosing at each fork — is real work. Crucially, *nothing
in the editing view needs it answered*: the overview draws the edges directly,
membership and validation are order-free, and only the presentation deck reads a
route as a sequence. So linearization is deferred together with presentation, not
as a separate task — the structure is a graph now, and ordering it for an audience
is decided when presentation is built.

## Consequences

`core`'s route schema changes from card-target steps to `{ from, to }` card edges.
`loadSpace` swaps its `route-revisits-card` duplicate check for a `route-has-cycle`
check and keeps the reference check that both endpoints resolve to real cards.

The live consumers move onto the graph directly and need no ordering.
`buildRouteEdges` gets *simpler* — the edges are the route, no longer consecutive
pairs derived from a sequence — and `routeCardIds` / `filterHandlesByRoute` are
membership queries that never cared about order. `navigation.ts` (`stepAt`,
`stepCount`) has no importers today; it is presentation scaffolding and parks with
the rest. The only order-dependent readers are the presentation deck
(`route.steps.map` → slides) and the store's `stepIndex`, both deferred with
presentation. Existing fixture routes are all linear, where an edge list has
exactly one order, so parking presentation costs no authored content; whether to
keep linear-route presentation alive with a trivial chain-walk or disable the
Present button during the transition is an implementation choice, not a decision
this ADR owes.

CONTEXT.md's **Step** entry — "one position in a route… a route visits each card
at most once" — is now wrong about the structure and retires in the docs cut;
"step" may survive as the *presentation* unit (one slide) but is no longer the
route's stored element. This is a schema-and-vocabulary change and rides its own
commit, separate from the authoring-surface work in 0021.
