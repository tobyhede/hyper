# 04 — Move the View, Layout, and Graph selectors onto Base UI Select

**What to build:** Give authors the same View, Layout and Active Graph selection behavior through Base UI Select, including the empty and inactive states, keyboard navigation, current-value presentation and coloured Graph affordances they use today.

**Blocked by:** 01 — Configure shadcn workspaces for Base UI and Lucide.

**Status:** resolved — delivered in PR #69.

- [ ] Rebuild the shared Select anatomy from the Base UI registry shape, including the portal, positioner, popup, list and item parts required by Base UI.
- [ ] Replay Hyper's custom toolbar palette and dimensions without retaining Radix state attributes, CSS variables or composition props.
- [ ] Migrate the View, Layout and Graph selector consumers while preserving controlled values, unavailable states, accessible names and selection callbacks.
- [ ] Preserve the protection that keeps React Flow's document-level deletion shortcut from treating a focused trigger or portalled popup as canvas input.
- [ ] Confirm the Select wrapper and all migrated selector files contain no Radix import, stale Radix composition prop or registry placeholder.
- [ ] Write the required Select migration report and verify pointer selection, keyboard navigation, typeahead, focus return and empty-state behavior by focused tests and manual QA.
- [ ] Pass typecheck and the production build in a Select-only commit.
