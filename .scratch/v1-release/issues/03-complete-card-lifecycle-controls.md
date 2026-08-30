# 03 — Complete the Card lifecycle controls

Status: ready-for-agent
Tags: release/v1
Blocked by: `space-cards/03`, `entity-url-addressability/07`

**What to build:** Expose one coherent create, rename and delete workflow for
Markdown, Alias and Space Cards using the authoring operations already in the app.

- [ ] Add Card explicitly chooses Markdown, Alias or Space.
- [ ] Alias creation chooses one immutable Markdown Target for V1.
- [ ] Space Card creation chooses an existing Space or atomically creates one.
- [ ] Rename edits the Card's own Title for every kind.
- [ ] Delete distinguishes whole-Space deletion from Remove from Layout and confirms
      every cascade before completing one Edit.
- [ ] The complete workflow works on desktop and narrow screens with keyboard and
      pointer input.

