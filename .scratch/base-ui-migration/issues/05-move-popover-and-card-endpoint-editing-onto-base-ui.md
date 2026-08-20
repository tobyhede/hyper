# 05 — Move Popover and Card endpoint editing onto Base UI

**What to build:** Move the connection target and Edge endpoint editing surfaces onto Base UI Popover while preserving their searchable Card-choice model, positioning, dismissal, focus behavior and React Flow integration.

**Blocked by:** 01 — Configure shadcn workspaces for Base UI and Lucide.

**Status:** resolved — delivered in PR #69.

- [ ] Rebuild the shared Popover using Base UI's portal, positioner and popup anatomy, forwarding positioning props to the part that owns them.
- [ ] Preserve Hyper's portalled-surface styling and the protection against React Flow handling deletion keys raised inside the popup.
- [ ] Keep cmdk Command and its title-based filtering untouched; migrate only Popover composition and the consumer props that Base UI changes.
- [ ] `AuthorableEdge` supplies its toolbar ref through `PopoverContent`'s Base UI `anchor` prop, the required non-trigger-anchor positioning form because Base UI has no `Anchor` part.
- [ ] Preserve connection-target and Edge-endpoint opening, search, selection, outside-press, Escape and focus-return behavior across mouse and keyboard paths.
- [ ] Confirm the migrated Popover and consumer files contain no Radix import, stale Radix composition prop or registry placeholder.
- [ ] Write the required Popover migration report, pass focused tests, typecheck and the production build, and manually verify the Edge editing surface in a real browser.
