# Draw every route in the overview

Status: resolved

## Context

`App` narrows to `selectedRouteId` before building anything:

```ts
const visibleCardIds = routeCardIds(manifest, selectedRouteId);
const routeHandles  = filterHandlesByRoute(allHandles, selectedRouteId);
const routeEdges    = allRouteEdges.filter((e) => e.routeId === selectedRouteId);
```

`buildCardHandles` and `buildRouteEdges` already produce the full set for every route. The narrowing is the only thing standing between the current view and a multi-route one.

## Task

In overview, build the layout graph from all cards the routes visit, all handles, and all route edges. `buildLayoutGraph` already takes exactly those three things and needs no change.

Keep membership a view decision (ADR 0005) — pass in which routes are shown rather than having the layout or the graph package decide. Even if the first version passes "all of them", the parameter is where route visibility controls will attach later.

`filterHandlesByRoute` and `routeCardIds` stay — presentation still uses them, and they are the right functions for a view that wants one route.

## Watch for

**A card on several routes gets several handle pairs.** `buildCardHandles` already emits one pair per route through the card, and `CardNode` renders them at the offsets ELK computed. This is the "multiple handles" technique working as designed, but it is the first time it will have run with more than one pair.

**Port order per side is `FIXED_ORDER`.** With a shared spine the two sides can disagree and the edges braid between cards. That is `layout-seam/04`, which this issue unblocks — expect to see it, and don't fix it here.

**The demo is compatible.** `quick` is a subsequence of `main`, so their union is acyclic and this should lay out cleanly. If it doesn't, something else is wrong — check the ELK port ids before blaming the overlay (`layout-seam/01`).

## Acceptance

- Overview draws both demo routes, each in its own colour, sharing `intro`, `model` and `demo`.
- Every card the routes visit is laid out left to right with no backward edge (the demo's routes are compatible, so there should be none).
- `pnpm verify` green. `pnpm e2e` needs updating — its node, edge and handle counts are all single-route assertions and will change deliberately.

## Answer

Done. `App` no longer narrows to the selected route.

`cardIdsForRoutes` and `filterHandlesByRoutes` are the new primitives in
`@project/graph`; `routeCardIds` and `filterHandlesByRoute` now delegate to them,
so presentation keeps its existing API and there is one implementation rather
than two. `buildLayoutGraph` needed no change, as expected.

Membership stayed a view decision: `App` holds a `visibleRouteIds` list — every
route, for now — and route visibility controls attach there.

Overview draws all routes equally; emphasis is `presenting ? selectedRouteId : null`,
which leaves multi-route/02's real question (should selection alone emphasise?)
genuinely open. `presenting` is now passed to `projectRouteEdges` — necessary here,
not scope creep, because with every route drawn the non-active ones would otherwise
stay fully opaque and animated during a presentation.

Measured on the demo, both routes laid out together:

```
intro=12 problem=432 model=852 rendering=1272 routes=1692 demo=2112
backward edges: []
```

Strictly monotonic, no backward edge — the routes are compatible, as predicted.

Counts moved as expected: 6 nodes (unchanged — the union is all six cards), 5 → 7
edges, 10 → 14 handles. The two e2e tests whose premise was single-route were
rewritten rather than retuned: "shows the selected route as a single colored flow"
became "draws every route at once, each in its own color", and "switching the route
swaps the visible flow" became "selecting a route keeps the others on screen".

A new e2e test covers the dimming, which had never run: in overview every edge is
at full opacity; while presenting, `quick`'s two edges fade and `main`'s five stay.

`pnpm verify` 54 tests green. `pnpm e2e` 5 green.
