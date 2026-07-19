# Rename path -> Route across the codebase

Status: open

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
