# 03 — Complete the Card lifecycle controls

Status: ready-for-agent
Tags: release/v1
Blocked by: `entity-url-addressability/07`

**What to build:** Expose one coherent kind-selection, rename, confirmation and
responsive command surface for Markdown, Alias and Space Cards using authoring
operations their feature tickets already own. `entity-url-addressability/07`
owns Space Card-specific creation, reference choice and atomic lifetime/cascade
semantics; this ticket composes them and does not implement them again.

- [ ] Add Card explicitly chooses Markdown, Alias or Space.
- [ ] Alias creation chooses one immutable Markdown Target for V1.
- [ ] Space Card creation chooses an existing Space or atomically creates one.
- [ ] Rename edits the Card's own Title for every kind.
- [ ] Delete distinguishes whole-Space deletion from Remove from Layout and confirms
      every cascade before completing one Edit.
- [ ] The complete workflow works on desktop and narrow screens with keyboard and
      pointer input.
