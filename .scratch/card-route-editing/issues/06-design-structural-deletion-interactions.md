# Design structural deletion interactions

Type: prototype
Status: resolved
Blocked by: 03, 05

## Question

How should an author target and remove a Card, an Edge from the active Route,
an Alias, or a Route; understand the already-decided cascade or blocked result;
choose whether a Route emptied by direct Edge removal or Card deletion remains
as an empty Route or is also deleted; confirm destructive consequences; and
recover cleanly from cancellation, validation failure, persistence failure, or
conflict without implying general undo?

## Prototype

[Structural deletion interactions — interaction storyboard](../prototypes/structural-deletion-interactions.md)

## Answer

The domain distinction is explicit. A Space owns Cards and Layouts. A Layout
owns an explicitly positioned subset of those Cards and a non-empty ordered
collection of Routes. Each Route belongs to exactly one Layout, is not reused
across Layouts, and may contain only Edges whose endpoints are Cards in that
Layout. This Layout ownership supersedes the earlier Space-owned Route plus
Layout-filter model.

**Remove from Layout** is the primary canvas Card operation. With exactly one
Card selected, the first `Delete` or `Backspace` arms removal by making the
selected state bold and red and exposing the concise consequence **Remove from
Layout · N Edges**; the second activation completes it. Escape, deselection,
opening the Card, changing Layout, or changing target disarms it. Confirmation
atomically removes the Card's position and every incident Edge from all Routes
owned by that Layout. The Card remains in the Space and other Layouts; empty
Routes and Layouts remain. Bulk removal is out of scope.

The existing Card editor supplies the pointer-accessible path and separates
**Remove from Layout** from the secondary **Delete Card from Space** action.
Both use the same two-activation armed-button convention without a dialog or
new canvas toolbar. Space deletion removes the Card from every Layout and every
incident Edge from all affected Layout-owned Routes. An Alias deletion leaves
its target; incoming Aliases block deletion of their target until explicitly
retargeted or deleted, but never block Layout removal. Armed Space deletion
summarises affected Layout and Edge counts.

A removed Card becomes available in the Space-card palette. Dragging it back
adds only its current Layout membership and drop position; deleted Edges are
not inferred or restored. The palette's detailed pointer and keyboard surface
is a newly surfaced decision.

Only the active Route's Edges are authorable. Dragging an endpoint reconnects
that endpoint to another Card in the same Layout, retains the Edge's owning
Route, permits self-Edges, treats its original endpoint as a no-op, and rejects
a duplicate directed pair by snapping back without an Edit. Dropping on genuine
empty graph canvas deletes the Edge; dropping outside or cancelling restores
it. A selected active-Route Edge is deleted immediately by `Delete` or
`Backspace`, without an armed state. The Route remains when its final Edge is
removed.

**Delete Route** in the Route manager uses the two-activation armed-button
convention and removes only that Layout-owned Route. It is disabled for the
Layout's last Route. Cards, positions, other Routes and other Layouts remain.
The manager stays open and activates the first surviving Route.

Every successful interaction crosses one semantic authoring operation that
computes and validates the complete next Space before installing it. A cancelled
or invalid interaction produces no Edit. A valid Edit remains optimistically
visible through persistence; retryable failures use the existing retry action,
and conflicts stay in the existing Space-level resolution flow. Accepting
stored state may restore removed structure. There is no deletion-specific
rollback or hidden undo history, while one semantic command per completed
gesture preserves a future bounded domain-level undo path.

The architecture may later permit an Algorithmic View to borrow one Layout-owned
Route as its subject. That product feature, including its selection, navigation,
management, presenting, and conversion interactions, is deferred from version 1.
