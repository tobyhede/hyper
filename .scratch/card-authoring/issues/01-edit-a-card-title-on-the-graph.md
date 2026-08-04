# 01 — Edit a Card title on the graph

**What to build:** Let an author rename any Card directly where its title is
drawn, completing one validated and automatically persisted Edit without
colliding with opening, dragging or Edge authoring.

**Blocked by:** `space-authoring/05` — Accept the stored Space without
remounting.

**Status:** ready-for-agent

- [ ] A hovered or selected Card exposes a visible title-edit affordance outside presenting.
- [ ] `F2` begins title editing for the selected Card without requiring a pointer.
- [ ] The inline field begins from the current title and keeps incomplete typing as local draft state.
- [ ] `Enter` and leaving a valid changed field complete the title Edit; `Escape` cancels and restores the unchanged Card.
- [ ] An invalid title remains local with an accessible field error and cannot reach Space Authoring or persistence.
- [ ] Completing the existing title is a no-op that does not convert an Algorithmic View, submit persistence or publish a Space update.
- [ ] Pointer and keyboard events inside the editor cannot open, drag, select, connect or otherwise activate the Card underneath it.
- [ ] An ordinary Card click outside the title editor continues to open the Card in place.
- [ ] The completed value is authoritative in the title editor before it notifies Space Authoring, which derives and validates the complete next Space.
- [ ] Renaming a Markdown Card updates every place its title is drawn or listed without changing its content.
- [ ] Renaming an Alias changes only the Alias's own title and leaves its target and the target Card unchanged.
- [ ] The first title Edit in an Algorithmic View creates and selects the next neutral Layout from the positions already on screen without moving a Card.
- [ ] A title Edit in a selected Layout updates that Layout in place and preserves its Route filter and active Route.
- [ ] The Edit submits exactly one complete Space snapshot and the new title survives a browser reload through the existing HTTP boundary.
- [ ] Presenting exposes no title-edit affordance or title-edit keyboard shortcut.
- [ ] Component tests cover affordance visibility, `F2`, Enter, blur, Escape, validation and event isolation through observable behavior.
- [ ] Playwright covers pointer and keyboard title editing, automatic persistence, reload durability and the absence of React Flow warnings or accidental gestures.
- [ ] `pnpm verify` and `pnpm e2e` pass.
