# 03: Say the Dock and the canvas read one Map view

**What to build:** The docs describe one `MapView` per drawing, read by the Dock and the canvas alike.

**Blocked by:** 02, and `.scratch/root-canvas-surface/issues/03`.

**Status:** resolved

**Spec:** `.scratch/one-map-reading/spec.md`.

- [x] `docs/agents/rendering.md` says `App` reads the root surface's Map view for the Dock and the Stage, and that `MapView` carries its Space.
- [x] `.scratch/architecture-review/2026-10-08-root-canvas-candidates.md` records candidate 6 as narrowed to one Map reading and done, with the broad form set aside.
- [x] The spec's status is resolved and each ticket's boxes are ticked.
- [x] Resolved with an `## Answer` recording what landed.

## Answer

**What landed.** `docs/agents/rendering.md`'s ADR 0112 entry now says that the Dock and the presenting Stage read the root surface's reading, which the canvas reads too. `App` takes the Space, the selected Map, its projection, the Resources outside it and their memberships from `reading.view`, and a `MapView` carries the Space it was built from. The entry also says the address, the Resources disclosure and the Stage's Copy link read the Map id from Navigation, and why. `.scratch/architecture-review/2026-10-08-root-canvas-candidates.md` records candidate 6 as done in the narrowed form, with the opened-Space object set aside. The spec's status is resolved and tickets 01–03 are ticked. `.scratch/root-canvas-surface/issues/03`, which blocked this ticket, was resolved earlier on this branch.
