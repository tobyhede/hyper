# 03 — An embedded Map is a surface over its own Space

**What to build:** Draw an Open Space Resource's Map as a surface over its target Space's own composition, and delete the embedding's separate assembly. A Space's composition is held by its Open Spaces listing and by each drawing of its Maps, so every drawn Map has a composition without the target being listed. The capabilities an embedded Map lacked arrive by construction.

**Blocked by:** 02.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md` (decisions 8, 10, 11, 13, 14, 15). **Decision:** ADR 0112.

## Acceptance criteria

- [ ] Opening a Space Resource or a Reference to one takes a hold on the target's composition without listing it; closing releases the hold.
- [ ] Exit removes a Space from the listing and releases only the listing's hold; a Space still drawn stays composed, unlisted and without an Opener, and is disposed when its last hold goes.
- [ ] Entering a drawn Space lists it and reuses its composition.
- [ ] The embedded surface takes authoring, `commandOutcomes`, `deleteConfirmation`, image replacement and Edge Authoring's completion and eligibility from the target's composition; nothing is borrowed from the containing Space.
- [ ] The surface owns its own render adapter over the Map and Graph the Space Resource selects; the same Space drawn twice with different Maps works.
- [ ] `EmbeddedMapAuthoring`'s separate wiring, the Edit allow-list in `embedded-authoring.ts`, its hand-built availability and its re-derived connect eligibility are deleted.
- [ ] In `authoring`, an embedded Map offers creation (drop, empty Option/Alt drop, paste at the pointer, keyboard), the full entity menu, Connect to Resource, Edge selection and deletion, and image Replace, each acting on the target Space.
- [ ] A drop on an `inert` or `read-only` surface is refused with wording and never lands in the Map beneath.
- [ ] An unwell target draws its last working state `read-only` with its own status words.
- [ ] `imageReplacement` is no longer an optional input anywhere on the canvas path.
- [ ] Tests assert the full Map capability list against an embedded Map in `authoring`, and the withheld set in `inert` and `read-only`.
