# 01: The canvas's own Map is a surface

**What to build:** A drawn-Map module (a *surface* in code) takes one composed Space, an explicit Map and Graph, and a policy, and owns what a Map offers on the canvas: the projection, Resource authoring, Edge Authoring, availability and commands. The canvas draws its own Map through it. Nothing an author sees changes; this makes the embedded Map's later move onto the same module a rewiring.

**Blocked by:** None (can start immediately). PR #331 must be merged.

**Status:** implementation under verification

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] One module answers what a drawn Map offers from a composed Space, a Map and Graph, and a policy; the canvas mounts it for its own Map.
- [ ] The projection is built over the Map and Graph the surface is given; the canvas's own surface is given Navigation's selection, and the module reads no Navigation itself.
- [ ] Every collaborator the surface uses comes from the one composition it is given.
- [ ] Existing unit, application E2E and Ladle E2E assertions pass unmodified.
- [ ] The surface is tested through its own interface over a real composition.

## Answer

The canvas now mounts `MapSurface` over its own composition with an explicit Map, Graph and policy. The surface owns projection, contextual authoring, the render adapter, Edge Authoring and occurrence continuation. `map-surface.test.ts` exercises the interface over a real composition. PR #331 remains the stack base by the user’s explicit approval; merging is left to the user.

Targeted verification is recorded on draft PR #332; the full CI gate must pass before this work is complete.
