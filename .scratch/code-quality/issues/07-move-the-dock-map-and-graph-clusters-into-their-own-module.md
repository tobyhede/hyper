# 07: Move the Dock's Map and Graph clusters into their own module

**What to build:** The Command Dock's Map and Graph clusters — identity menus, choice menus, add, rename, delete and present — in their own module. The Dock composes them.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The clusters' module exports the components the Dock mounts. Shared renaming and disclosure context lives in a shared Dock module
- [ ] No change in behaviour or appearance: stories, Ladle proofs and e2e unchanged
- [ ] UI catalog check passes with no new inventory entries
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green
