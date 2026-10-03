# 02: A Space is composed while anything holds it

**What to build:** A Space's composition is held by its Open Spaces listing and by each drawing of one of its Maps. Opening a Space Resource, or a Reference Resource whose Target is one, holds the target without listing it; closing releases the hold. Exit releases only the listing's hold, so a Space another Map still draws keeps drawing. An embedded Map whose target was never listed becomes authorable in Edit, through today's embedding.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] Opening a Space Resource, or a Reference to one, composes its target without listing it in Open Spaces; closing releases that hold.
- [ ] A composition is disposed when its last hold is released, and not before.
- [ ] Exit removes a Space from the listing and releases only that hold; a Space still drawn stays composed, unlisted and without an Opener, and keeps drawing.
- [ ] Entering a Space that is only drawn lists it with an Opener and reuses the composition already held.
- [ ] An embedded Map whose target was never listed is authorable in Edit.
- [ ] The Dock's Open Spaces menu shows only listed Spaces.
