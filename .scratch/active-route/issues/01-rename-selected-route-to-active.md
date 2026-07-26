# Rename: the selected route is the active route

Status: open

ADR 0026 collapses two words into one. A route is **active**; the highlight is how that is shown, and nothing about it carries separate meaning. ADR 0021 had asserted an identity between the two ("the active route is the selected route"), which reads as reconciling two concepts where there is one.

Rename, with no behaviour change:

- `store.ts` — `selectedRouteId` → `activeRouteId`, `selectRoute` → `activateRoute`. The doc comment on the field already says this ticket's name.
- `RouteSelector` — `selectedRouteId` → `activeRouteId`, `onSelect` → `onActivate`.
- `App.tsx`, `store.test.ts` and any e2e that names either.

`RouteLegend` already says `activeRouteId`, as do `projectCardNodes` and `projectRouteEdges` — the adapter got there first.

Runs **alone and early**, in its own commit: `workflow.md` forbids a rename riding along with a structural change, and every later ticket would otherwise add surface in the old vocabulary.

`pnpm e2e` must be green **and unchanged**.
