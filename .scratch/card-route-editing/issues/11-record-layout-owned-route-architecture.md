# Record the Layout-owned Route architecture

Type: task
Status: resolved
Blocked by: 06

## Question

Record the accepted architecture in an ADR that supersedes the earlier
Space-owned reusable-Route and unplaced-Card assumptions: Layouts explicitly
own Card membership and ordered Routes, Route Edges are closed over that Card
set, Space- and Route-scoped Algorithmic Views have distinct subjects, and
conversion of a Route-scoped View copies rather than shares its Route. Identify
the accepted ADRs and standing guidance whose wording must be corrected before
implementation planning begins.

## ADR

[ADR 0040 — Layouts own Card membership and Routes](../../../docs/adr/0040-layouts-own-card-membership-and-routes.md)

## Answer

ADR 0040 records the accepted aggregate: a Space owns Cards and Layouts; each
Layout explicitly owns its positioned Card members and ordered Routes; every
Route has exactly one Layout owner; and every Edge endpoint must name a Card in
that Layout. Omission from the position map means absence from the Layout, not
an implementation-defined unplaced state. Add to Layout writes membership and
position; Remove from Layout removes both plus incident Layout-local Edges;
empty Routes remain until explicitly deleted.

The ADR supersedes the Space-level reusable-Route/filter model in ADRs 0022 and
0026. It refines the still-binding decisions in ADRs 0003, 0007, 0014, 0015,
0025, 0028 and 0031: Routes remain the only graph structure, Layout remains
authored data rather than strategy behaviour, a Space with no Layout may remain
Route-less while every Layout owns at least one Active Route, activation remains
navigation, and conversion remains visually a no-op with no strategy
provenance. ADRs 0030 and 0033 now point at the new ownership and identity scope
without claiming the unbuilt schema already exists. ADR 0041 subsequently
renames Route to Graph without changing that cardinality.

Algorithmic Views now have explicit subjects. Space-scoped Views choose Space
Cards without borrowing a Route. Route-scoped Views borrow one Layout-owned
Route; editing copies the rendered Cards and positions plus that Route under a
fresh identity into a new Layout, leaving the source Layout and Route unchanged.
That Route-scoped shape is an architectural allowance only; its product surface
and conversion interaction are deferred beyond this authoring effort.

`CONTEXT.md` already carries the accepted glossary. `AGENTS.md` now separates
the accepted first-public target from the built disposable version 2 shape,
replaces the fallback-band and Layout-filter guidance, and identifies ADR 0040
as not built. Feature code, schemas, fixtures and tests were deliberately not
changed: their Space-level Routes and omitted-Card fallback behavior are the
implementation that follow-on planning must replace, not a second valid model.
