# 07: Move the Dock's Map and Graph clusters into their own module

**What to build:** The Command Dock's Map and Graph clusters — identity menus, choice menus, add, rename, delete and present — in their own module. The Dock composes them.

**Blocked by:** 05

**Status:** resolved

- [x] The clusters' module exports the components the Dock mounts. Shared renaming and disclosure context lives in a shared Dock module (`CommandDockMapGraph.tsx` exports `MapControls` and `GraphControls`; `DockCanvas`/`DockGraph` live with the other Dock chrome types in `command-dock-chrome.ts`; renaming and disclosure contexts in `command-dock-shared.ts`, `IdentitySurface` in `CommandDockParts.tsx`; `command-surface-sharing.test.ts` now reads the `ChoiceMenu` call sites from the new module)
- [ ] No change in behaviour or appearance: stories, Ladle proofs and e2e unchanged — pending coordinator e2e run; no story, Ladle proof or e2e file was edited
- [x] UI catalog check passes with no new inventory entries
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green — `pnpm verify` run on the finished branch; e2e and Ladle pending coordinator e2e run
