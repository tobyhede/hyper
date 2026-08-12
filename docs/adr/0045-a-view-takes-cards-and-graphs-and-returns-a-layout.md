# A View takes Cards and Graphs and returns a Layout

Status: accepted
Refines: 0040
Related: 0024, 0025, 0027, 0031, 0041

A View is an interface with two sides. It receives a subject — Cards, and zero or more Graphs — and renders it. When an author edits it, it returns everything needed to create a Layout: those Cards with their positions, and one or more Graphs. What a View does between those two sides is its own business, and this ADR deliberately says nothing about it.

## The two obligations

Everything a View returns satisfies two rules, and they belong at the boundary rather than inside any implementation.

**Closure.** Every Edge endpoint of every returned Graph is among the returned Cards. ADR 0040 states this invariant for a Layout; stating it as the View's output obligation is what makes it hold for every Layout a View can produce, including ones nobody has designed yet.

**Fresh identity.** Every Graph a View returns carries a new identity owned by the new Layout. A View may return the Graphs it was showing, a fresh empty one, or a pruned projection — all legal — but none of them may carry a source Graph's identity. This is what makes ADR 0040's ownership structural rather than conventional: no View, present or future, can produce two Layouts pointing at one Graph.

The cardinality is deliberately asymmetric. Zero Graphs on the way in, because a new Space is one Card with no Graphs (ADR 0018) and has to render. One or more on the way out, because a Layout with no Graph is invalid (ADR 0040) — satisfied, where there is nothing to carry over, by a Graph with no Edges.

## What this replaces

ADR 0040's "Algorithmic Views have explicit subjects" section named two kinds of View and gave each its own rules: a Space-scoped View "chooses Space Cards as its subject without borrowing a Route", while a Route-scoped View "borrows one Layout-owned Route and projects the Cards that View selects from it", with conversion copying that source Route under a fresh identity. That section is replaced. There are no View kinds in the model — there is one interface over an open subject. A tree over the Cards one Graph connects is not a second kind of thing; it is a View whose subject happens to be those Cards.

Two defects went with it.

The first was found in review of PR #39 and recorded as `.scratch/adr-0040-0042/issues/02-graph-scoped-conversion-can-break-0040s-closure-rule.md`. Nothing required a Graph-scoped View's subject to be *all* of its source Graph's Cards, so selecting a subset and converting produced a Layout whose copied Edges named non-members — violating the closure invariant stated three paragraphs earlier in the same document. The closure obligation removes that by construction rather than by adding a sentence about conversion.

The second was an over-claim. ADR 0040 said "The ownership rules here prevent that future feature from reopening the aggregate when it is designed" and supplied no mechanism that would. The fresh-identity rule is that mechanism, and with it the claim is true.

## A subject of Space Cards draws every Graph

A View whose subject is the Space's Cards draws every Graph in the Space, flattened across its Layouts. Closure is automatic there: every Edge endpoint is a member of some Layout, every Layout member is a Space Card, so such a View can never draw a dangling endpoint.

ADR 0040's alternative — that a Space-scoped View borrows no Graph and therefore draws no Edges — was incoherent with the built-in View it governs. The application's default is **Flow**, which `defaultViewSchema` describes as the graph-driven flow: an arrangement computed *from* the Graph. A graph-driven arrangement with no Graph to drive it is not a degenerate case, it is a contradiction. It would also have made the tracked fixture's appearance — ELK-placed Cards under four coloured Graphs — unrepresentable in the first-public shape, since Graphs nest under Layouts there and the fixture's Layouts do not position every Card of every Graph.

The cost is that "the Graphs of a Space" returns as a concept. It is derived and never stored: a flatten over the Layouts, computed where it is needed, and no Graph gains a second owner by appearing in it. The legibility ceiling such a flatten can reach is the overlay problem `.scratch/multiple-routes/findings.md` measured — clean while the union of the drawn Edges is acyclic, and past about four Graphs colour stops separating them — and the answer to that is the built emphasis-and-dim behaviour, not a restriction on what a View may draw.

## Graph identity is unique within the Space

A Graph belongs to one Layout, and its id is unique across the Space rather than only within that owner. ADR 0040 scoped Route identity to the owning Layout, which permits two Layouts to hold Graphs carrying the same UUID. The flatten above makes that permission unusable rather than merely unused: `loadSpace` indexes Graphs as `new Map(graphs.map((g) => [g.id, g]))`, so a duplicate id silently drops one Graph from the index while it remains in the collection; `outHandleId` and `inHandleId` would put a single handle id on a Card for two different Graphs, which is exactly the per-Card-per-side distinguishability React Flow requires and the named cause of its warning #008; and colour, visibility and activation all key on the same id.

The alternative was to carry an owner qualifier through the flattened view — every Graph reference becoming a Layout-and-Graph pair, through `visibleGraphIds`, `viewShowsGraph`, the active Graph, the colour map, the render Edge, the legend and the handle-id scheme. That is a wide change to a pipeline whose handle ids are load-bearing for two libraries at once, bought to support a reuse nothing asks for.

Nothing does ask for it. `newUuid` mints globally, every Graph a View returns is fresh by the rule above, and a future copy-a-Layout operation mints on copy for the same reason. The one remaining source is a hand-authored document, where a duplicate is a load error naming both — which is already what a duplicate Card id across files is.

Layout-scoped identity was never chosen: it fell out of nesting, the way sharing fell out of the ids-and-filter shape that preceded it. This refines ADR 0040's identity sentence and nothing else in it. Which Layout a Graph belongs to is unchanged; only the scope its id must be unique in moves.

## What follows for the built-in Views

Both of these are consequences of the interface rather than rules of their own, and either may be revisited without touching this ADR.

The Flow view returns a fresh empty Graph on conversion, not a copy of the Graph the author was emphasising. A copy is legal under the interface. It is not what this View does, because a copy is how two Graphs carrying one title begin diverging silently — a price ADR 0040 accepts deliberately for two Layouts that need the same narrative, and not one to incur by accident on every conversion. An author who was emphasising one Graph, drew an Edge and found it in a new empty Graph has been surprised once; an author whose two "Onboarding" Graphs drifted apart over a month has been harmed.

Activating a Graph on an Algorithmic View is visual emphasis and nothing else. It does not choose where a drawn Edge lands, and it cannot affect presenting, which is available from a Layout only (ADR 0024, ADR 0027).

## What it cost

**Duplication is now the only way to get one narrative into two arrangements, and the interface enforces it.** ADR 0040 accepted that price; the fresh-identity rule removes the last route around it. Two Layouts that want the same Graph get two Graphs, and nothing tells the author when they diverge. The alternative was examined at length in `.scratch/adr-0040-0042/issues/06-is-a-graph-owned-by-one-layout-or-curated-once-and-placed.md` and rejected: under sharing, removing a Card from one Layout either leaves an Edge whose endpoint is absent there or mutates every other Layout drawing that Graph, and both horns are wrong before any interface exists.

**A View's freedom is real, so a badly written View can produce a poor Layout.** The obligations constrain validity, not judgement: returning every Space Card when the author was looking at four of them satisfies both rules and is still wrong. The boundary catches corruption, not taste.

## The negative

**Do not reintroduce View kinds.** Space-scoped and Graph-scoped were named types in ADR 0040 with divergent rules, and that is precisely how the closure gap opened — a rule stated for one kind and not the other. A future review reading a tree View that selects one Graph's Cards will be tempted to give it a name and its own conversion rule. It does not need one; it needs the two obligations, which it already has.

**Do not let a View return a source Graph's identity, however obviously convenient.** The case that will argue for it is exactly the compelling one: an author converting a View of a Graph they have curated for weeks, who plainly means *that* Graph. Granting it makes two Layouts owners of one Graph and reopens the aggregate ADR 0040 closed. If sharing is ever wanted, it is a new decision about the domain, not an exception granted at this seam.
