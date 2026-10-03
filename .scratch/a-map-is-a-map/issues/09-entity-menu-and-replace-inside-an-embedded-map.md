# 09: Entity menu and Replace inside an embedded Map

**What to build:** A Resource in an embedded Map in Edit offers the full entity menu — Rename, Create Reference, Enter, Open in New Tab, copy links, Remove from Map, Delete from Space — and an Image Resource offers Replace, each acting on that Resource's own Space. A replacement there holds navigation like any other.

**Blocked by:** 03, 07.

**Status:** implementation under verification

**Spec:** `.scratch/a-map-is-a-map/spec.md`. **Decision:** ADR 0112.

- [ ] The entity menu in an embedded Map offers what it offers on the canvas, and each command acts on the embedded Space.
- [ ] Enter from an embedded Map lists the entered Space with the embedded Space as its Opener.
- [ ] Replace on an embedded Image Resource replaces it through its own Space's replacement and holds Back and Forward while it runs.
- [ ] The canvas's replacement input is required; nothing on the canvas path treats it as optional.
- [ ] Inert and read-only Maps withhold these exactly as the policy says.

## Answer

Embedded Resources use the shared entity menu and the target Space’s image replacement. Replace, Enter, references and target-owned deletion use the same collaborators as the canvas. Application and Ladle parity proofs cover the rail and menu; browser replacement proves that an only-drawn Space owns the result.

Targeted verification is recorded on draft PR #332; the full CI gate must pass before this work is complete.
