# 06: Move the Dock's Spaces cluster into its own module

**What to build:** The Command Dock's Spaces cluster — the Space menu, the Opener and Open Spaces tree, and the exit report (`DockSpace.exitReport`, drawn by `ExitReport`) — in its own module. The Dock composes it. `PersistenceReport` is not part of the cluster: it stays Dock-owned, in the Dock's generic `report` slot.

**Blocked by:** 05

**Status:** resolved

- [x] The cluster's module exports one component the Dock mounts. Any context it shares with other clusters lives in a shared Dock module, not in the Dock file (`CommandDockSpaces.tsx` exports `SpacesControl`; the Dock chrome types it consumes live in `command-dock-chrome.ts`; contexts, hooks and constants in `command-dock-shared.ts`; shared pieces — `Divider`, `IdentitySurface`, `SetTrigger` — in `CommandDockParts.tsx`)
- [x] No change in behaviour or appearance: stories, Ladle proofs and e2e unchanged — no story, Ladle proof or e2e file was edited; PR #279's e2e and Ladle jobs passed (CI run 36075465995)
- [x] UI catalog check passes with no new inventory entries
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green — `pnpm verify` run on the finished branch; e2e and Ladle passed in PR #279's CI (run 36075465995)
