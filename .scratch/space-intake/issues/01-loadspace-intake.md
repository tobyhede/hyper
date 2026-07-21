# loadSpace: one call that parses, validates and indexes into a Space

Status: open

## Task

Introduce a single intake, `loadSpace(input) → Result<Space, SpaceError[]>`, that turns raw input into a validated, indexed **Space**, or a list of errors. It subsumes `safeParseManifest` + `validateReferences` + the ad-hoc lookups, so the order can no longer be got wrong and the derivation functions cannot run on an unvalidated space.

Fold the `Array.find` lookups into the index built during intake — reads become O(1).

This carries the `Manifest → Space` rename (ADR 0010): the top-level type is `Space`, and every downstream signature (`getCard`, `buildCardHandles`, `buildRouteEdges`, the projection) takes a `Space`. `parseManifest`/`safeParseManifest` are subsumed and removed. The zod schema stays as an internal shape-gate inside `loadSpace`; its output is not a public type. Keep `Card`/`Route`/`RouteStep` — only the container was misnamed. Rename the bundled file to `space.json` and `app/manifest.ts` to `app/space.ts`. Do not mint a file-layer noun (no `Document`/`Source`); the file is just "the space file".

Decide during design: does `Space` stay a plain data value with a separate index, or does intake return a value whose lookup functions close over the index? The former keeps `core` free of behaviour; the latter gives a smaller interface. Keep the `core`/`graph` split intact — shape in `core`, referential integrity and indexing in `graph`.

## Acceptance

- One call validates shape *and* references and returns a `Space` or `SpaceError[]`.
- Lookups are O(1).
- No consumer can reach a derivation function with an unvalidated space.
- No `Manifest`/`manifest` identifiers remain (Card/Route/RouteStep stay).
- `pnpm verify` green; `pnpm e2e` green and unchanged (no behaviour change).
