# 06: An embedded Map is a surface over its own Space

**What to build:** An Open Space Resource's Map is drawn by the same surface as the canvas, over its target's own composition. The embedding's separate assembly — its own wiring, the Edit allow-list, the hand-built availability and the re-derived connection rules — is deleted. What an author can do in an embedded Map is unchanged by this ticket; the capabilities it lacks arrive in 08–10.

**Blocked by:** 01, 02, 04, 05.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] An embedded Map takes authoring, command outcomes, delete confirmation, image replacement and Edge Authoring's completion and eligibility from its target's composition; nothing is borrowed from the containing Space.
- [ ] Each embedded surface has its own render adapter over the Map and Graph its Space Resource selects; one Space drawn twice, with the same or different Maps, works.
- [ ] The embedding's separate assembly is deleted, and no Edit is refused for being made through an embedding.
- [ ] Its notices appear in the one notice area.
- [ ] Every existing embedded-Map behaviour test passes.
