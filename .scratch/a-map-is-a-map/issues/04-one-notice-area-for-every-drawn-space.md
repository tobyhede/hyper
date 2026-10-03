# 04: One notice area for every drawn Space

**What to build:** The notice area shows the command outcomes of the canvas's own Space and of every Space drawn inside it, so a drawn Map can report through its own Space's outcomes and still be seen.

**Blocked by:** 02.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] The notice area reads the outcomes of every Space drawn on the canvas.
- [ ] A notice from a drawn Space names that Space; a notice from the canvas's own Space does not.
- [ ] A notice's lifetime follows its own Space's Map and replacement epoch, never the containing Space's.
