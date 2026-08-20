# Migrate `no-conditional-empty-object-spread`

Status: ready-for-agent

## Context

28 prod / 17 test across 22 files, moderate concentration — the top 3 files
carry 13 of 45 hits (29%), the remaining 19 files carry 1-2 each:

| File | Hits | Kind |
| --- | ---: | --- |
| `packages/react-flow-adapter/src/projection.ts` | 5 | prod |
| `src/export/export-space.ts` | 4 | prod |
| `packages/react-flow-adapter/test/CardNode.test.tsx` | 4 | test |
| `packages/app/test/space-authoring.test.ts` | 4 | test |
| `packages/app/src/space-authoring.ts` | 4 | prod |
| `packages/app/src/edge-authoring-react.tsx` | 2 | prod |
| `packages/app/src/render-adapter.ts` | 2 | prod |
| `packages/app/src/snapshot.ts` | 2 | prod |
| remaining 19 files | 1-2 each | mixed |

`research.md`: "Rewriting them into explicit object construction may improve
the boundary semantics, even where the existing expression is type-safe" —
i.e. this rule isn't only catching bugs, some findings are legitimate style
even when the current code is correct.

## Direction

Migrate by package, in this order: `react-flow-adapter` (1 file, 5 hits) and
`export-space.ts` (1 file, 4 hits) first since they're single-file and
self-contained; then `app`'s `space-authoring.ts` / `edge-authoring-react.tsx`
/ `render-adapter.ts` / `snapshot.ts` together since they share the Space
Authoring module; then the remaining 1-2-hit files as a final sweep.

For each site, replace the conditional spread with explicit object
construction that states whether the property exists, rather than leaving it
implicit in a `...(cond ? { key } : {})` pattern.

Enable `no-conditional-empty-object-spread` in `oxlint.config.ts` once all 45
sites are clean.

## Caution

This is the second-largest rule by hit count. Land it in the package groupings
above rather than one 45-site commit — each group is independently reviewable.
