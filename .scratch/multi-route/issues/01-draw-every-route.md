# Draw every route in the overview

Status: open

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
