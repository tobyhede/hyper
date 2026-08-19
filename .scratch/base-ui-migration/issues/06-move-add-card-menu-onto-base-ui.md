# 06 — Move the Add Card menu onto Base UI

**What to build:** Keep the split Add Card control's one-click Card creation and menu-driven Alias creation intact while Base UI Menu takes ownership of keyboard navigation, dismissal and focus continuity.

**Blocked by:** 03 — Move Button onto Base UI.

**Status:** resolved — delivered in PR #69.

- [ ] Rebuild the menu from the idiomatic Base UI/shadcn parts and replace Radix child composition with Base UI rendering without changing the split-control presentation.
- [ ] Preserve immediate Add Card, the announced keyboard shortcut, disabled behavior and the menu trigger's accessible name.
- [ ] Preserve the complete keyboard path through opening the menu, choosing Add Alias, focusing the Alias pane, cancelling it and returning focus to the re-enabled trigger.
- [ ] Start from Base UI's non-modal, close and focus defaults; record any behavior delta in the report rather than silently recreating Radix internals.
- [ ] Confirm the menu component and its consumers contain no Radix import, stale Radix composition prop or registry placeholder.
- [ ] Write the required Dropdown Menu migration report and pass focused UI/app tests, typecheck, the production build and one-minute pointer/keyboard manual QA in a menu-only commit.
