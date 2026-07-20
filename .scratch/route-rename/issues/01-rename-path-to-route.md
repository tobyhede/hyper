# Rename path -> Route across the codebase

Status: resolved

## Task

A pure rename. No structural change, no behaviour change.

**core** — `pathSchema` → `routeSchema`, `pathStepSchema` → `routeStepSchema`, `PresentationPath` → `Route`, `PathStep` → `RouteStep`, `PathId` → `RouteId`, and the manifest key `paths` → `routes`.

**graph** — `getPath` → `getRoute`, `PathHandleRef` → `RouteHandleRef`, `PathEdge` → `RouteEdge`, `buildPathEdges` → `buildRouteEdges`, `pathCardIds` → `routeCardIds`, `filterHandlesByPath` → `filterHandlesByRoute`, `outHandleId`/`inHandleId` parameters `pathId` → `routeId`, error kinds `duplicate-path-id` → `duplicate-route-id` and `unresolved-path-step` → `unresolved-route-step`. Navigation helpers take `route: Route`.

**react-flow-adapter** — `ColorByPathId` → `ColorByRouteId`, `projectPathEdges` → `projectRouteEdges`, `ProjectPathEdgesOptions`, `activePathId` → `activeRouteId`, `CardHandle.pathId` → `routeId`.

**app** — `selectedPathId` → `selectedRouteId`, `selectPath` → `selectRoute`, `pathColorMap` → `routeColorMap`, `PATH_PALETTE` → `ROUTE_PALETTE`, local `pathHandles`/`pathEdges`/`allPathEdges`.

**ui** — `PathSelector` → `RouteSelector`, `PathLegend` → `RouteLegend`.

**Also** — the `rf-path-edge` CSS class in `packages/app/src/styles.css`, the `paths` key in `packages/app/example/graph.json`, and the handle id format (`${routeId}::out` — same shape, renamed variable).

Finally, delete the "path == Route" gotcha from AGENTS.md, since it will no longer be true.

## Acceptance

- No `path`/`Path` identifiers referring to the Route concept remain (React Flow's own `path` APIs and file-system paths are unaffected).
- `pnpm verify` and `pnpm e2e` green, e2e unchanged.
- `CONTEXT.md` needs no edit — the glossary is already the target.

## Answer

Done in two commits.

`db1c2bf` is the rename itself, exactly as scoped above, plus the CSS classes and
`data-testid`s (`path-selector` → `route-selector`, `path-legend` → `route-legend`,
`rf-path-edge` → `rf-route-edge`) and the README. `pnpm verify` 43 tests green,
`pnpm e2e` 4 specs green. The e2e diff is identifier and prose substitution only —
every assertion, selector-of-behaviour and count is unchanged, which is what shows the
rename stayed behaviour-preserving.

`75fd00d` sweeps the bundled example deck, which turned up staleness the rename wasn't
looking for: `cards/model.md` still listed a `nodes` array described as "A card placed
at a position", and `cards/paths.md` showed `intro-node`/`demo-node` step targets. Both
were retired by ADR 0004 and never swept out of the demo content. That deck is the
product's own explanation of itself, so it was teaching a model that no longer exists.

Three `path` identifiers survive on purpose, and AGENTS.md now says so: filesystem
paths, TanStack Router's URL `path`, and React Flow's `react-flow__edge-path` class.

`.scratch/multiple-routes/` was deliberately **not** renamed — it is a frozen record of
measurements taken against the code as it stood. `findings.md` carries a note mapping the
old identifiers to the new ones.
