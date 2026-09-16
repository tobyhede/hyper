# 01 — Space Thing rail slot

Status: resolved

**What to build:** Diagram and Graph rail clusters for an Open Space Thing are assembled in app and passed into `CanvasThing` as a pre-built `spaceRail` fragment — not as `CanvasSpaceThingSelection` data that ui orchestrates. An author still chooses Diagram and Graph, renames, creates, deletes, and recolors from the same controls in the same rail position; portal Read/Edit, Open/Close, and entity actions stay on the Thing front unchanged. Refusal and busy notices from context commands still appear on the Thing; orchestration and RF-specific menu behaviour live in app.

**Blocked by:** None — can start immediately.

- [x] `SpaceThingRailClusters` (or equivalent app module) renders Diagram and Graph clusters using `@project/ui` primitives (`ChoiceMenu`, `InlineTitleEditor`, `ThingRailAction`, …), including busy/renaming state, async command handling, and the hidden continuation bridge for Add Diagram.
- [x] `CanvasSpaceThingCommands` and related wire types move to app; `@project/ui` no longer exports selector components or `CanvasSpaceThingSelection`.
- [x] Open Space Thing front accepts `spaceRail?: ReactNode` and top-level `portal?: { editing; onEditingChange }`; `CanvasThing` inserts `spaceRail` at the head of `ThingRailActions` and keeps the context-notice alert region fed from decoration.
- [x] `canvas-thing-authoring` builds `data.spaceRail` per decorated node (host and embedded paths), holds per-Thing context notices and `onEditingChange` for context-menu editing, and omits the rail when the Thing is closed, read-only, or the target is unread.
- [x] Projection and `ThingNode` carry `spaceRail` and portal fields instead of `spaceSelection`; `renderRail` / ViewportPortal behaviour unchanged.
- [x] Selector behaviour proofs move to app unit tests; ui tests cover only that a provided `spaceRail` renders in the rail slot.
- [x] `pnpm verify` passes; Space Thing rail Ladle and application proofs (context menus, rename focus, portal Read/Edit) stay green.
