# A space may have no routes; it then cannot be presented

Status: accepted
Refines: 0007
Refined by: 0018, 0040, 0041

`routes` may be empty. A space with no routes loads, indexes and renders its cards like any other; what it cannot do is present, because presenting walks a route's steps and there is none to walk. The Present control is disabled rather than merely unselected, which is already how the store behaves — `selectedRouteId` starts `null` when there are no routes and `enterPresentation` refuses to act without one.

Editing forces this. A new space is one card and no structure yet, and `routes: z.array(routeSchema).min(1)` made that state unrepresentable — so every editing flow would have had to open by inventing a route to satisfy the schema, and a one-step route is a journey with no journey in it. The constraint was never actually decided: `git log -S` puts it in the `path → Route` rename, inherited from `paths.min(1)`, with no ADR behind it. It encoded the assumption that a space exists in order to be presented, which was true while the app only read spaces.

We rejected introducing the **Draft** here, which is what `.scratch/graph-editing/commands.md` reserved for exactly this case ("a route-less Draft can't go through `loadSpace`"). The reasoning there was sound but proves something narrower than it looks: a route-less space is not *invalid*, it is empty, and ADR 0010's guarantee that a Space is consistent by construction is untouched by zero routes. A Draft earns its place when editing can produce a genuinely inconsistent intermediate — a route step pointing at a card being deleted, a connection drawn but not yet landed — and at that point it is a real answer to a real problem. Until then it is a second top-level type, a mutation API and a re-validation cycle bought for a state that is simply small. This defers the Draft; it does not refute it.

The consequence that reaches furthest is that the graph view can no longer decide which cards to draw by asking the routes. `App` derives `visibleCardIds` from `cardIdsForRoutes`, so a space whose cards are not yet routed would render an empty canvas — the one thing a new space must not do. Which cards a view draws was already the View's choice rather than the layout's (ADR 0005), so this is a change at the composition layer and not to the model.

The costs accepted: every `routes[0]` and "the first route" assumption has to tolerate absence; a space file that has lost its routes to a typo now loads silently instead of failing at intake, which trades a loud error for a representable empty state; and the abstract fixture keeps its routes, so nothing in the existing e2e suite exercises the empty case — it needs its own coverage rather than inheriting any.
