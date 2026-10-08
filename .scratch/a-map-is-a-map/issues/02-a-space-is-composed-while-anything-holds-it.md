# 02: A Space is composed while anything holds it

**What to build:** A Space's composition is held by its Open Spaces listing and by each drawing of one of its Maps. Opening a Space Resource, or a Reference Resource whose Target is one, holds the target without listing it; closing releases the hold. Exit releases only the listing's hold, so a Space another Map still draws keeps drawing. An embedded Map whose target was never listed becomes authorable in Edit, through today's embedding.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [x] Opening a Space Resource, or a Reference to one, composes its target without listing it in Open Spaces; closing releases that hold.
- [x] A composition is disposed when its last hold is released, and not before.
- [x] Exit removes a Space from the listing and releases only that hold; a Space still drawn stays composed, unlisted and without an Opener, and keeps drawing.
- [x] Entering a Space that is only drawn lists it with an Opener and reuses the composition already held.
- [x] An embedded Map whose target was never listed is authorable in Edit.
- [x] The Dock's Open Spaces menu shows only listed Spaces.

## Answer

OpenSpaces holds one composition for its listing and every drawing. Draw-only holds do not join the Dock listing; Enter reuses that composition and records its Opener, Exit releases only the listing, and the last release flushes and disposes. The public OpenSpaces tests cover each lifetime and returning to an only-drawn Opener.

Delivered by PR #332, merged 2026-10-04 with its CI gate green. The 2026-10-08 closeout verification, and the tests it added in PR #346, are recorded in `implementation-review.md`.
