# loadSpace: one call that parses, validates and indexes into a Space

Status: resolved

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

## Answer

Built test-first. `pnpm verify` green (72 tests, +5), `pnpm e2e` green and **unchanged** (14) — the proof the rename preserved behaviour.

**Intake.** `loadSpace(input) → { ok: true, space } | { ok: false, errors: SpaceError[] }` in `@project/graph/space.ts`. It shape-parses with the (renamed) `spaceFileSchema`, maps zod issues to `{ kind: 'invalid-shape' }`, runs `validateReferences` over the parsed file, and on success builds the index. `SpaceError = invalid-shape | ReferenceError`.

**Space shape (the design fork).** Chose the data-value-with-index form over closure-style lookups: `Space` carries `{ title, cards, routes }` plus `cardsById`/`routesById` maps, and `getCard`/`getRoute` stay free functions reading the index (O(1)). This kept every call site a pure `manifest → space` variable rename rather than a call-style rewrite — which is what let e2e stay unchanged. A `Space` is minted only by `loadSpace`, so "consistent by construction" is real.

**Rename.** `Manifest`/`parseManifest`/`safeParseManifest` removed; `manifestSchema` → `spaceFileSchema`; every `graph`/adapter/app signature takes `Space`; `validateReferences` takes a structural `Referenceable` so it accepts both a raw parsed file (inside `loadSpace`) and a Space. Files: `example/graph.json` → `example/space.json`, `app/manifest.ts` → `app/space.ts`. Card/Route/RouteStep untouched.

**App.** `app/space.ts` loads the bundled space via `loadSpace` and throws on failure — the bundled file is authored valid, so a bad load is a build-time bug (as `parseManifest` already threw on shape errors). The old `referenceErrors` banner and its `.errors` CSS are gone: `loadSpace` makes rendering a half-valid space impossible by construction, so there is nothing to warn about while still drawing.

Store threading (removing the singleton import) is issue 02.
