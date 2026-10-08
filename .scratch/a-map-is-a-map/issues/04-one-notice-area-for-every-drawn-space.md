# 04: One notice area for every drawn Space

**What to build:** The notice area shows the command outcomes of the canvas's own Space and of every Space drawn inside it, so a drawn Map can report through its own Space's outcomes and still be seen.

**Blocked by:** 02.

**Status:** resolved

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [x] The notice area reads the outcomes of every Space drawn on the canvas.
- [x] A notice from a drawn Space names that Space; a notice from the canvas's own Space does not.
- [x] A notice's lifetime follows its own Space's Map and replacement epoch, never the containing Space's.

## Answer

The containing application collects the Spaces currently drawn and renders their own command outcomes in one notice area, prefixing embedded notices with their Space’s live title. Notices stay owned by the target composition across containing Map switches. The embedded application test covers this lifetime.

Delivered by PR #332, merged 2026-10-04 with its CI gate green. A verification pass on 2026-10-08 checked every criterion against `main` and added the tests it found missing in the closeout PR.
