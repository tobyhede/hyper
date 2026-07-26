# `resolveView` answers which routes show and which is active

Status: open
Blocked by: 03

`ResolvedView` gains the resolved answers: the visible route ids, and the active one. The fallbacks apply **here**, not in the store —

- visible: `layout.routes`, else every route in the space;
- active: `layout.activeRoute`, else the first visible route, else `null` for a space with no routes (ADR 0015).

This is the right home. It is the same space-says / viewer-says / app-says resolution `defaultView` already runs through, and it keeps the fallback in one place rather than two.

Consequences in `App.tsx`:

- `visibleRouteIds` stops being `space.routes.map(...)` and comes from the view. The comment there already says membership is the view's decision (ADR 0005) — this is that, honoured.
- `createSpaceStore` takes the initial active route from the resolved view instead of reaching for `space.routes[0]` itself.
- `RouteSelector` and `RouteLegend` list the **visible** routes, not every route. Activating only ever moves within that set, which is what keeps *selection is emphasis, not filtering* true.
