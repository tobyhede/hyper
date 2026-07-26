# `resolveView` answers which routes show and which is active

Status: resolved
Blocked by: 03

`ResolvedView` gains the resolved answers: the visible route ids, and the active one. The fallbacks apply **here**, not in the store —

- visible: `layout.routes`, else every route in the space;
- active: `layout.activeRoute`, else the first visible route, else `null` for a space with no routes (ADR 0015).

This is the right home. It is the same space-says / viewer-says / app-says resolution `defaultView` already runs through, and it keeps the fallback in one place rather than two.

Consequences in `App.tsx`:

- `visibleRouteIds` stops being `space.routes.map(...)` and comes from the view. The comment there already says membership is the view's decision (ADR 0005) — this is that, honoured.
- `createSpaceStore` takes the initial active route from the resolved view instead of reaching for `space.routes[0]` itself.
- `RouteSelector` and `RouteLegend` list the **visible** routes, not every route. Activating only ever moves within that set, which is what keeps *selection is emphasis, not filtering* true.

## Answer

`cd73310`. `ResolvedView` gained `visibleRouteIds` and `activeRouteId`, both computed by one `resolveRoutes` helper used by both branches.

The ordering matters and is easy to get wrong: the active-route fallback runs over the **visible** list, not the space's routes. Taking the first of `space.routes` would open active on a route the Layout filters out — which `loadSpace` rejects when an author writes it, so the resolver must not produce it either. There is a test named for exactly that.

`createSpaceStore` takes the active route as a required second argument. Required rather than defaulted, so there is no second place quietly answering the same question. The store test that used to assert "starts with the space's first route" now passes `r2` to a fixture whose first route is `r1` — it asserts the store does *not* pick.

`visibleRoutes` is filtered once at module scope beside `view`, since both the space and the view are static.
