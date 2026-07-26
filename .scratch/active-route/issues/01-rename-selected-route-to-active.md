# Rename: the selected route is the active route

Status: resolved

ADR 0026 collapses two words into one. A route is **active**; the highlight is how that is shown, and nothing about it carries separate meaning. ADR 0021 had asserted an identity between the two ("the active route is the selected route"), which reads as reconciling two concepts where there is one.

Rename, with no behaviour change:

- `store.ts` — `selectedRouteId` → `activeRouteId`, `selectRoute` → `activateRoute`. The doc comment on the field already says this ticket's name.
- `RouteSelector` — `selectedRouteId` → `activeRouteId`, `onSelect` → `onActivate`.
- `App.tsx`, `store.test.ts` and any e2e that names either.

`RouteLegend` already says `activeRouteId`, as do `projectCardNodes` and `projectRouteEdges` — the adapter got there first.

Runs **alone and early**, in its own commit: `workflow.md` forbids a rename riding along with a structural change, and every later ticket would otherwise add surface in the old vocabulary.

`pnpm e2e` must be green **and unchanged**.

## Answer

`32a4e85`. `selectedRouteId` → `activeRouteId`, `selectRoute` → `activateRoute`, and `RouteSelector`'s `selectedRouteId`/`onSelect` → `activeRouteId`/`onActivate`.

The component kept its name. A control that selects among routes is ADR 0026's own language for the dedicated interaction ("a control that names the space's visible routes and selects among them"); what is retired is *selected route* as a state concept beside the active one. The `route-selector` testid and CSS class went with it, so no e2e file was touched.

222 unit tests, 28 e2e — green and unchanged, which is the guard that it was behaviour-preserving.
