# Emphasise the selected route instead of hiding the others

Status: resolved
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

## Answer

Took the first reading: **selection is emphasis, at all times.** The toolbar
selector now does something the moment you use it, instead of appearing inert
until you press Present.

`presenting: boolean` is gone from the adapter. It could not express what was
needed — there are **three** states, not two: nothing selected, something
selected with the whole space on screen, and one route being walked. A boolean
forced the first two to look identical, which is exactly why the selector did
nothing in overview.

```ts
export type RouteEmphasis = 'equal' | 'subtle' | 'strong';
export const OTHER_ROUTE_OPACITY = { equal: 1, subtle: 0.35, strong: 0.12 };
```

The view picks the level (`presenting ? 'strong' : selectedRouteId ? 'subtle' : 'equal'`)
and the adapter no longer knows the app has modes — `presenting` was app state
that had leaked across the seam.

`CardNode` now fades handles by the same amount as their route's edges, reading
`OTHER_ROUTE_OPACITY` rather than its own hardcoded `0.15`. Before this it dimmed
handles to 0.15 whenever any route was active, which would have left a receding
route drawn as faint dots on the cards with full-strength edges between them.

The ticket flagged that 0.12 had never been seen against real content, since it
was written for a view where the other routes were invisible. It holds up while
presenting. 0.35 for overview is new and chosen by eye — worth adjusting if it
reads wrong.

**Not changed:** `RouteLegend` still dims non-selected routes to a fixed 0.4 and
does not follow the emphasis level, so while presenting the legend is lighter than
the graph it describes. Unifying them would mean `RouteEmphasis` crossing into
`@project/ui`, which depends only on `core` — a boundary question worth deciding
deliberately rather than in passing.

`pnpm verify` 57 tests green, `pnpm e2e` 5 green.
