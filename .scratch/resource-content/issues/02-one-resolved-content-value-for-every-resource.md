# 02: One resolved content value for every Resource (expand)

**What to build:** A single value says what any Resource's content is — Markdown with its source, an image with its URL, a Space view, or unresolved — and whether it is the Resource's own or reached through a Reference Resource. It is declared once where every package can see it, and `graph` resolves it totally and in one hop from a Resource (not an id), beside the existing resolution, which stays until 06. See `spec.md` for the type shapes. Nothing draws from it yet.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Markdown, Image and Space Resources resolve to their own content with `via: 'self'`; a Reference Resource resolves to its Target's content with `via: 'reference'`.
- [x] A Reference Resource whose Target is missing, or is itself a Reference Resource, resolves to `unresolved` (a table test builds that Space by hand, since intake refuses it).
- [x] A property test over Spaces intake accepts: the result is never `unresolved`, `via` is `'self'` exactly for non-Reference Resources, and a Reference Resource's result equals its Target's with `via` changed.
- [x] The Space view carries only what an Open Space Resource shows (its Space, Map, Graph and framing), not the Resource.
- [x] `graph`'s curated package surface lists the new function.
- [x] `pnpm verify` passes.

## Comments

**2026-09-29.** Built. `ContentVia`, `SpaceView` and `ResourceContent` are declared in `packages/core/src/resource-content.ts` and exported whole from core's index. `resolveResourceContent(space, resource)` sits in `packages/graph/src/lookup.ts` beside `resolveContentResource`, which is unchanged; both are in graph's index and in `test/unit/graph-package-surface.test.ts`. `SpaceView.framing` is a required key holding `undefined` for an unframed Space Resource. The table test is in `packages/graph/test/lookup.test.ts`. Its broken Spaces are built by spreading a loaded Space and replacing its `lookup` with one `buildSpaceLookup` builds over the refused Resources. The property test is in `packages/graph/test/graph.property.test.ts`, over `mapsArb` with each generated Resource given a kind. A Space Resource there targets a Space other than its own, which intake requires. Both properties fail when the Reference arm answers `via: 'self'`. `pnpm verify` passed; `pnpm e2e` was not run, since nothing a browser draws changed.
