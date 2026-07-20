# Render several routes at once

Source: conversation 2026-07-20. Raised as "multi-route rendering is a core feature — this is the entire thing the original prototype was demonstrating."

## Problem

The app renders one route at a time. `App` picks `selectedRouteId`, then narrows everything to it before anything else runs: `routeCardIds` for the visible cards, `filterHandlesByRoute` for the handles, and a `.filter()` on `routeId` for the edges.

That is not a design choice that was taken. It is a gap, and the codebase shows it — **the machinery for drawing several routes at once exists and has never run**:

- `projectRouteEdges` takes a `presenting` flag that dims non-active routes' edges to opacity 0.12. **`App` has never passed it**, in this commit or the initial one.
- `CardNode` dims handles whose `routeId` differs from the active route to opacity 0.15. Dead, because `filterHandlesByRoute` removed those handles before they ever reached it.
- `RouteLegend` dims non-active routes — a colour key for routes you can see simultaneously.
- `buildCardHandles` builds handles for *every* route through every card, and `filterHandlesByRoute` throws almost all of them away.
- `routeColorMap` assigns a distinct colour per route, which only matters if more than one is visible.

So the domain and render layers were built for this and the app narrows to one route in front of them.

## What changed to make it tractable

The old rule in AGENTS.md said overlaying routes made ELK "reconcile conflicting orderings and the graph turns to spaghetti". `.scratch/multiple-routes/findings.md` disproved it: **compatible** routes — whose combined step-order is acyclic — lay out cleanly, and the spaghetti everyone attributed to overlay was the ELK port-id collision, fixed in `layout-seam/01`.

The bundled demo is already compatible. `quick` (`intro → model → demo`) is a subsequence of `main`, so the two share a spine and their union is acyclic. It should overlay cleanly on day one, and it gives the shared-spine shape that `04` and `08` need in order to be measurable at all.

## Direction

Overview shows the space: every route drawn, each in its own colour, sharing cards where they overlap. Selecting a route emphasises it rather than hiding the others. Presentation dims the rest — the behaviour `projectRouteEdges` already implements and nobody has ever seen.

Which routes are shown is a **View** decision (ADR 0005), so it is passed into the layout, not decided by it.

## Constraints

- ADR 0003 — routes may conflict, and the combined step-order may contain a cycle. A view must tolerate that. Conflicting routes force a backward edge; drawing it legibly needs `layout-seam/03`.
- ADR 0005 — many routes, one layout. Routes contribute handles and edges to the graph the layout consumes; they do not multiply layouts.
- Read `.scratch/multiple-routes/findings.md` before starting. It has the measured shapes.

## Issues

- `01-draw-every-route` — stop narrowing to one route in overview.
- `02-emphasise-the-selected-route` — wire the dimming that already exists.

## Unblocks

`layout-seam/04` (FIXED_SIDE port constraints) and `layout-seam/08` (node placement strategy) are both blocked on this — their effects are only observable when several routes share cards. `layout-seam/03` (ELK edge routing) becomes materially more valuable, since conflicting routes are where backward edges appear.
