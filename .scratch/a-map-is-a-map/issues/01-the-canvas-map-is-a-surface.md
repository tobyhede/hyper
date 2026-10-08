# 01: The canvas's own Map is a surface

**What to build:** A drawn-Map module (a *surface* in code) takes one composed Space, an explicit Map and Graph, and a policy, and owns what a Map offers on the canvas: the projection, Resource authoring, Edge Authoring, availability and commands. The canvas draws its own Map through it. Nothing an author sees changes; this makes the embedded Map's later move onto the same module a rewiring.

**Blocked by:** None (can start immediately). PR #331 must be merged.

**Status:** resolved

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [x] One module answers what a drawn Map offers from a composed Space, a Map and Graph, and a policy; the canvas mounts it for its own Map.
- [x] The projection is built over the Map and Graph the surface is given; the canvas's own surface is given Navigation's selection, and the module reads no Navigation itself.
- [x] Every collaborator the surface uses comes from the one composition it is given.
- [x] Existing unit, application E2E and Ladle E2E assertions pass unmodified.
- [x] The surface is tested through its own interface over a real composition.

## Answer

The canvas now mounts `MapSurface` over its own composition with an explicit Map, Graph and policy. The surface owns projection, contextual authoring, the render adapter, Edge Authoring and occurrence continuation. `map-surface.test.ts` exercises the interface over a real composition. PR #331 remains the stack base by the user’s explicit approval; merging is left to the user.

Delivered by PR #332, merged 2026-10-04 with its CI gate green. The 2026-10-08 closeout verification, and the tests it added in PR #346, are recorded in `implementation-review.md`.
