# Layouts own Card membership and Routes

Status: accepted
Supersedes: 0022, 0026
Refines: 0003, 0007, 0014, 0015, 0025, 0028, 0030, 0031, 0033
Refined by: 0041
Related: 0035

A Space owns Cards and Layouts. A Layout explicitly owns the subset of Space
Cards it contains, each Card's position, and a non-empty ordered collection of
Routes over those Cards. Every Route belongs to exactly one Layout, and
every Edge in that Route has both endpoints in the owning Layout's Card set.
When present, a Layout's Routes are the graphs drawn over its shared Cards;
detached Cards and empty Routes are valid, but a Layout with no Route is not.

Card membership and position are one authored fact. The Layout's card-to-
position map is not merely sparse geometry over an otherwise complete Space
projection: omission means the Card is absent from that Layout and is not drawn
there. **Add to Layout** writes membership and an initial position. **Remove
from Layout** removes both and, in the same Edit, removes every incident Edge
from every Route that Layout owns. It does not delete the Card from the Space or
affect another Layout. Routes made empty by removal remain authored until an
author explicitly deletes them. The old deterministic placement of omitted
Cards outside the authored region is therefore retired rather than promoted to
a product concept.

Routes are not reusable objects and a Layout no longer filters a Space-level
Route collection. Its ordered `routes` collection contains the Routes it owns;
it may optionally name one of them as `activeRoute`, otherwise the first is the
fallback. Route identity is scoped to the owning Layout. Deleting a Route
changes only that Layout and is unavailable for its last Route. If the deleted
Route is the named `activeRoute`, the remaining Routes are considered in
authored order and the first survivor becomes active; if no Route survives,
`activeRoute` is cleared and the resulting Layout is rejected because a valid
Layout cannot have no Route. This same rule must be enforced by both authoring
and intake, with intake rejecting any dangling `activeRoute` rather than
preserving it. Deleting a Card from the Space performs Remove from Layout's
cascade in every Layout.
Creating a Layout creates its initial empty active Route in the same Edit.
**Add Route** appends and activates a new empty Route in an existing Layout; on
an Algorithmic View, the initial Route created by conversion is itself the one
requested by Add Route rather than an extra predecessor.

## Why ownership follows authoring

The rejected model made Routes peers of Layouts under the Space and let each
Layout opt into a subset. That enabled one Route to be drawn through several
Layouts, but Hyper has no requirement to reuse a Route that way. More
importantly, Routes are authored only through a Layout. Under shared ownership,
removing a Card from one Layout either leaves an invisible Route Edge whose
endpoint is absent or mutates a shared Route and unexpectedly changes every
other Layout that shows it. A filter cannot make either consequence local or
clear.

Layout ownership makes the graph an author edits closed over the Cards they can
see. Card removal has one local cascade, Route management has one local owner,
and another Layout cannot change because an author edited this one. The price is
deliberate duplication when two Layouts need initially identical narratives;
subsequent edits are independent. That matches the absence of a Route-reuse
requirement and avoids pretending two spatial authoring surfaces share
structure when their edits cannot remain independent.

## Algorithmic Views have explicit subjects

An Algorithmic View is either **Space-scoped** or **Route-scoped**. A
Space-scoped View such as Grid or alphabetical order chooses Space Cards as its
subject without borrowing a Route. A Route-scoped View such as Tree borrows one
Layout-owned Route and projects the Cards that View selects from it. The View
does not own, share, or move the Route.

Route-scoped Views are an architectural allowance, not a version 1 product
feature. Their selector, navigation, Route management, presenting behavior and
conversion interaction are deferred beyond the Card and Route authoring effort.
The ownership rules here prevent that future feature from reopening the
aggregate when it is designed.

ADR 0025's conversion rule still applies to either subject: editing copies the
Cards and positions currently rendered into a new Layout so conversion is
visually a no-op. Converting a Space-scoped View creates the Layout's initial
Route; a connecting Edit adds its Edge to that Route, while a placement-only
Edit leaves it empty. Converting a Route-scoped View instead copies its source
Route under a fresh identity owned by the new Layout; it never reuses or
reparents the source. The source Layout and Route remain unchanged, and ADR
0031's no-strategy-provenance rule still holds. This specifies the safe
architectural crossing, not the deferred interaction that invokes it.

## Consequences

The first-public document shape nests complete Routes under each Layout rather
than storing Space-level Routes plus Layout filters. A Layout's position keys
are its explicit Card membership. Intake validates Card references at two
levels: every member names a Space Card, and every owned Edge endpoint names a
member of that Layout. Layout Route order is authored, creation appends,
deletion preserves survivor order without permitting an empty collection, and
manual reordering remains a separate operation.

This is a breaking aggregate-shape change, accepted before release: disposable
development data rolls forward to the single version 1 shape rather than
gaining a compatibility migration. Persistence remains optimistic whole-
snapshot persistence; ownership changes the snapshot's domain shape, not its
commit protocol. Current code that projects every Space Card through a sparse
Layout, resolves Space-level Route filters, or scopes Route ids to the Space is
the implementation being replaced, not an alternative interpretation of this
ADR.
