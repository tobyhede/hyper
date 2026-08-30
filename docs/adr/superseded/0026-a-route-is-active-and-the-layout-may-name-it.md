# A space has one active route; a Layout may name it, and otherwise it is the first

Status: superseded
Superseded by: 0040
Supersedes: 0022
Refined by: 0028
Related: 0003, 0021, 0024, 0027

A space has one **active route** at a time. It is the route drawn emphasized in the view and the route an author's edges are written into (ADR 0021). There is one concept, not two — "selected" and "active" are the same thing, and the highlight is how it is shown, nothing more.

A Layout carries two optional, independent pointers into its space's routes:

- **`routes`** — the subset it *shows*. A filter. Absent means every route.
- **`activeRoute`** — which visible route is active when the Layout opens. Must be one of the visible routes.

**Absent an `activeRoute`, the first visible route is active.** A space with routes always has one active; a space with none has none, and the first edge drawn mints one (ADR 0021).

Changing the active route is a **dedicated interaction** — a control that names the space's visible routes and selects among them. Which control is a UI decision and is not made here. What matters is that it is deliberate: activating a route is never a side effect of drawing an edge, clicking a card, opening one, or moving the canvas.

## What survives from 0022

The filter/emphasis split, and the rule it was written to preserve. Filtering is authored view scope — a Layout arranged for some routes should not draw the ones it was not arranged for — and activating a route never changes what is visible. So *selection is emphasis, not filtering* still holds, narrowed by 0022's clause: the filter is the Layout's, not the selection's. An overview that draws every route is a Layout with no filter.

The one-way dependency survives too. A Route is a peer of Layout under the Space, never owned by one: geometry references topology, never the reverse.

## What this corrects

**"Absent means none (or the first)" is resolved to the first.** 0022 left an either/or inside an accepted decision, and ADR 0021 then built on it — every drawn edge joins the active route. Under "none", an author whose space has routes but whose Layout names no `activeRoute` has nowhere for the first edge to land, and 0021's lazy-mint rule does not cover it because that rule is scoped to a space with no routes at all. The first visible route closes the gap with no new machinery.

**Emphasis and write-target were never two meanings.** 0021 states that "the active route is the selected route", which reads as an identity asserted between two concepts. There is only one. A route is active; it is highlighted *because* it is active. Nothing about the highlight carries separate meaning, and no rule needs to reconcile the two.

**0022's ownership argument is replaced, not its conclusion.** 0022 argued a Route must be able to exist with no Layout because "it presents as a deck with zero geometry — reveal.js needs no positions". That reasons from a display library to a structural relationship, which is the move ADR 0023 forbids in the very commit that made it: presentation is a display problem and must not constrain the domain. It is now wrong twice over — reveal.js is gone (ADR 0024) and a Route no longer carries order (ADR 0023).

The conclusion stands, carried by the argument 0022 gave alongside it and which depends on neither: ownership would force a route to be re-authored in every Layout that wants it — the duplication ADR 0004 refused for placement, one level up.

## The cost we accept

A Layout naming no `activeRoute` depends on route order, so reordering a space's routes changes which one opens active. Acceptable: it is a default, its effect is visible immediately on open, and naming an `activeRoute` overrides it.

Carried forward from 0022: two more self-references in the space file, so `loadSpace` gains two checks — both ids validated against the space's routes, and `activeRoute` checked to be within the visible set. And "which routes show" has an authored source while "which is active" has an authored default plus a runtime override. A reader holds both, because they are genuinely two questions.

A future review will see one route singled out as active and suggest allowing several — editing two routes at once, or emphasizing a set. That is new work with its own decision. 0021 accepted floating edges on the explicit basis that authoring is one active route at a time; changing that reopens how overlapping routes are drawn in the authoring view, which is the problem the per-route handle scheme existed to solve.
