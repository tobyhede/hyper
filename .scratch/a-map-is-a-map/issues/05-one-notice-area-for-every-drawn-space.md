# 05 — One notice area for every drawn Space

**What to build:** Show the command outcomes of every Space drawn on the canvas in the one notice area, so a surface can use its own Space's `commandOutcomes` without its notices disappearing into that Space's hidden `App`.

**Blocked by:** 03.

**Status:** ready-for-agent

**Spec:** `.scratch/a-map-is-a-map/spec.md` (decision 9). **Decision:** ADR 0112.

## Acceptance criteria

- [ ] The notice area reads the outcomes of the canvas's own Space and every Space drawn inside it.
- [ ] A notice from an embedded Space names that Space; one from the canvas's own Space does not.
- [ ] A notice's lifetime follows its own Space's Map and replacement epoch, never the containing Space's.
