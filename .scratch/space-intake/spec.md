# One intake: parse, validate, index into a Space

Source: `/improve-codebase-architecture` review, 2026-07-19 — candidates 2 and 4. Vocabulary settled 2026-07-21 (ADR 0010).

## Problem

Validation is split-brain. Shape validation lives in `@project/core` (`safeParseManifest`), referential integrity in `@project/graph` (`validateReferences`), by deliberate design — but that means no single call turns raw input into a value you can trust. The caller must remember to run both, in order, and nothing stops `buildCardHandles`/`buildRouteEdges` running on a value whose references were never checked, even though they assume resolved references.

Lookups compound it: `getCard`/`getRoute` are `Array.find` wrappers that build no index, so every read is O(n) over the relevant array.

The real logic — the wiring — therefore lives in the app, outside the packages. `core` and `graph` are a toolbox, not a pipeline.

Separately, the top-level value is misnamed. The code calls it `Manifest`, a shipping-ledger word for a static list — wrong for an authored, reshapeable world. The domain term is **Space** (ADR 0010), and `manifest` is retired. Today's `Manifest` is also a hardcoded module singleton that `store.ts` and `App.tsx` import from module scope rather than receive, coupling state logic to the single bundled example.

## Direction

`loadSpace(input) → Result<Space, SpaceError[]>` — one deep call that parses the shape, validates references, and builds an index, returning a **Space** whose lookups are O(1) and whose consistency is guaranteed by construction. Then thread that Space in as a value rather than importing it.

This is where `Manifest → Space` happens: not a separable rename pass, because Space is a stronger concept than today's parsed value (validated + indexed), not a new spelling of it (ADR 0010). The serialized shape the zod schema describes stays private to `loadSpace` — an implementation detail, not a public domain type. The bundled file becomes "the space file" (`space.json`); there is no `Document`/`Source` noun (that vocabulary belongs to the future edit buffer, the `Draft`, which is not built here).

## Sequencing

Best done after `layout-seam`. It carries the `Manifest → Space` rename, so it should run before new surface accretes in the old vocabulary.

## Issues

- `01-loadspace-intake`
- `02-pass-space-into-store`
