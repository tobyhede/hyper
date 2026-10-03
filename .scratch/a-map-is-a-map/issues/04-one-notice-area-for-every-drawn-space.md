# 04: One notice area for every drawn Space

**What to build:** The notice area shows the command outcomes of the canvas's own Space and of every Space drawn inside it, so a drawn Map can report through its own Space's outcomes and still be seen.

**Blocked by:** 02.

**Status:** implementation under verification

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] The notice area reads the outcomes of every Space drawn on the canvas.
- [ ] A notice from a drawn Space names that Space; a notice from the canvas's own Space does not.
- [ ] A notice's lifetime follows its own Space's Map and replacement epoch, never the containing Space's.

## Answer

The containing application collects the Spaces currently drawn and renders their own command outcomes in one notice area, prefixing embedded notices with their Space’s live title. Notices stay owned by the target composition across containing Map switches. The embedded application test covers this lifetime.

Targeted verification is recorded on draft PR #332; the full CI gate must pass before this work is complete.
