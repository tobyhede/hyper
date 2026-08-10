# Decide how new Routes enter Layouts

Type: grilling
Status: resolved
Blocked by: 01
Superseded by: 06

## Question

When the author completes a new Route while the selected Layout shows only a
filtered subset of Routes, which Layouts should begin showing the new Route,
which should remain unchanged, and how does that choice preserve the rule that
Route activation is emphasis rather than filtering?

## Answer

This answer was superseded when **Design structural deletion interactions**
made the stronger ownership decision. A Layout does not filter a shared set of
Space Routes: it owns its ordered Routes. Add Route and the Route-less first
connection create a Route only in the current Layout, so no cross-Layout
visibility rule or reuse mechanism exists.

Space-scoped Algorithmic Views have no Route subject. Route-scoped Algorithmic
Views may borrow one Layout-owned Route for rendering; converting such a View
copies that Route under a new identity into the new Layout rather than sharing
it. The detailed management behavior of those Views belongs to **Design
Route-scoped View navigation and authoring**.
