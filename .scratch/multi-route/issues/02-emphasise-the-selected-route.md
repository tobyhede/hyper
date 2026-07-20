# Emphasise the selected route instead of hiding the others

Status: open
Blocked by: 01

## Context

Selecting a route currently means "show only this one". With every route drawn (issue 01), selection should mean "emphasise this one" — and the code to do it already exists, unused:

- `projectRouteEdges(edges, colors, { activeRouteId, presenting })` — when `presenting` is true, non-active routes' edges drop to opacity 0.12 and lose their animation. **`App` has never passed `presenting`.**
- `CardNode` dims handles whose `routeId` differs from `data.activeRouteId` to opacity 0.15. Never exercised, because handles were pre-filtered to one route.
- `RouteLegend` already dims non-active routes.

## Task

Pass `presenting` through from the store, and let `activeRouteId` do the emphasis rather than the filtering.

Decide what selection means outside presentation. Two coherent readings, and this issue should pick one deliberately:

- **Selection is emphasis** — the selected route is drawn strongly, others faintly, at all times. Consistent with presentation, and the space stays legible as a whole.
- **Selection only matters while presenting** — overview draws every route equally, and emphasis appears when you present. Cleaner overview, but the selector then has no visible effect until you press Present.

Recommendation: the first. It makes the toolbar selector do something immediately and matches what the dimming code was evidently written for.

## Watch for

Opacity 0.12 was chosen for a view where the *other* routes were invisible, so it has never been seen against real content. It may need adjusting once several routes are actually drawn — that is a judgement to make with it on screen, not in advance.

## Acceptance

- Every route stays drawn; the selected one is visually dominant.
- Presenting dims non-active routes, using the existing `presenting` flag rather than new code.
- `pnpm verify` and `pnpm e2e` green, with e2e covering that a non-selected route is still present in the DOM rather than removed.
