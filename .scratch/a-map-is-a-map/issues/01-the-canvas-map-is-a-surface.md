# 01 — The canvas's own Map is a surface

**What to build:** Introduce the drawn-Map module (a *surface* in code) and make the canvas's own Map its root instance, with no change an author can see. A surface takes one Space's composed app, an explicit Map and Graph, and a policy, and owns the projection, the Resource authoring hook, Edge Authoring, availability and the commands a Map offers. `SpaceCanvas` draws the root surface instead of wiring those collaborators itself.

**Blocked by:** PR #331.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

## Acceptance criteria

- [ ] One module answers what a drawn Map offers from a composed Space, a Map and Graph, and a policy; `SpaceCanvas` mounts it for its own Map.
- [ ] The projection is built over the explicit Map and Graph the surface is given, not read from Navigation inside the module; the root surface is given Navigation's selection.
- [ ] Every collaborator the surface uses comes from the one composition it is given.
- [ ] Behaviour is unchanged: existing unit, application E2E and Ladle E2E assertions pass unmodified.
- [ ] The surface is tested through its interface with a real composition, not through `SpaceCanvas`.
