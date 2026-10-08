# 08: Create inside an embedded Map

**What to build:** An author editing an embedded Map creates Resources in it exactly as on the canvas: a drop, an empty Option/Alt drop and a paste at the pointer land in the Map under the point, and keyboard creation lands in the selection's occurrence. The new Resource is selected with its caret placed in the drawing it was made in.

**Blocked by:** 07.

**Status:** resolved

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [x] Every creation gesture the canvas offers creates in the embedded Map's Space and Map when made there in Edit.
- [x] The continuation selects the new Resource and places the caret in the originating drawing, including when another drawing shows the same Map.
- [x] A drop or paste on an inert or read-only Map is refused with wording and never lands in the Map beneath it.
- [x] The Command Dock still creates in the canvas's own Space.

## Answer

Pointer drop, paste and empty Alt-drop resolve the drawing under the point and convert coordinates through that drawing. Keyboard creation follows the selected occurrence. Inert/read-only targets refuse rather than forwarding creation to the containing Map. Naming continuation stays with the originating surface; application/browser tests cover these paths.

Delivered by PR #332, merged 2026-10-04 with its CI gate green. The 2026-10-08 closeout verification, and the tests it added in PR #346, are recorded in `implementation-review.md`.
