# 03 — One canvas command toolbar for Resources and Edges

Status: ready-for-agent

**What to build:** Extract what `ResourceRailActions` and `ResourceRailAction` (`packages/ui/src/ResourceRailActions.tsx`) do that is not about Resources — `CommandToolbar` plus the keydown stop, and a `ToolbarButton` with `nodrag nopan` and the click/pointer-down stops — into canvas-generic components in `@project/ui` (e.g. `CanvasCommandToolbar`, `CanvasCommand`). The Resource rail and the Edge toolbar both build on them.

**Why:** The prototype had to borrow Resource-named components for the Edge. Nothing in them is Resource-specific; the kind and shared groups are what stay Resource-owned.

- [ ] `test/unit/command-surface-sharing.test.ts` holds the Edge toolbar to the shared surface as it holds the Dock and the Resource rail.
- [ ] No change to the Resource rail's rendered markup or behaviour; its existing stories and specs pass unchanged.
