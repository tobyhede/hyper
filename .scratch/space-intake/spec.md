# One intake: parse, validate, index

Source: `/improve-codebase-architecture` review, 2026-07-19 — candidates 2 and 4.

## Problem

Validation is split-brain. Shape validation lives in `@project/core` (`safeParseManifest`), referential integrity in `@project/graph` (`validateReferences`), by deliberate design — but that means no single call validates a manifest. The caller must remember to run both, in order, and nothing stops `buildCardHandles`/`buildRouteEdges` running on a manifest whose references were never checked, even though they assume resolved references.

Lookups compound it: `getCard`/`getRoute` are `Array.find` wrappers that build no index, so every read is O(n) over the relevant array.

The real logic — the wiring — therefore lives in the app, outside the packages. `core` and `graph` are a toolbox, not a pipeline.

Separately, `manifest` is a hardcoded module singleton that `store.ts` and `App.tsx` both import from module scope rather than receive, coupling state logic to the single bundled example and making fixture-based testing awkward.

## Direction

`loadSpace(input) -> Result<Space, SpaceError[]>` — one deep call that parses, validates references, and builds an index, returning a Space whose lookups are O(1) and whose consistency is guaranteed by construction. Then thread that Space in as a value rather than importing it.

## Sequencing

Best done after `layout-seam`, and after `route-rename` (so the Space value is named in the target vocabulary from the start rather than renamed immediately after).

## Issues

- `01-loadspace-intake`
- `02-pass-space-into-store`
