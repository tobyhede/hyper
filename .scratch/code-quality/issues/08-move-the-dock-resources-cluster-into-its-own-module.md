# 08: Move the Dock's Resources cluster into its own module

**What to build:** The Command Dock's Resources cluster — the create peers, the Resources trigger and list — in its own module. The Dock composes it.

**Blocked by:** 05

**Status:** resolved

- [x] The cluster's module exports the component the Dock mounts. Shared disclosure context lives in a shared Dock module (`CommandDockResources.tsx` exports `ResourcesControl` plus `DockResources`, `DockResourcesList`, `DockResourcesDisclosure` and `DockResourceKind`; `DockDisclosureContext` and `RESOURCES_DISCLOSURE_ID` in `command-dock-shared.ts`)
- [ ] No change in behaviour or appearance: stories, Ladle proofs and e2e unchanged — pending coordinator e2e run; no story, Ladle proof or e2e file was edited
- [x] UI catalog check passes with no new inventory entries
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green — `pnpm verify` run on the finished branch; e2e and Ladle pending coordinator e2e run
