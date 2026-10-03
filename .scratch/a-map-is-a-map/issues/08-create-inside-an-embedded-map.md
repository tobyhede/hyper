# 08: Create inside an embedded Map

**What to build:** An author editing an embedded Map creates Resources in it exactly as on the canvas: a drop, an empty Option/Alt drop and a paste at the pointer land in the Map under the point, and keyboard creation lands in the selection's occurrence. The new Resource is selected with its caret placed in the drawing it was made in.

**Blocked by:** 07.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] Every creation gesture the canvas offers creates in the embedded Map's Space and Map when made there in Edit.
- [ ] The continuation selects the new Resource and places the caret in the originating drawing, including when another drawing shows the same Map.
- [ ] A drop or paste on an inert or read-only Map is refused with wording and never lands in the Map beneath it.
- [ ] The Command Dock still creates in the canvas's own Space.
