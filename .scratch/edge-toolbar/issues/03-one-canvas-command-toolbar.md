# 03 — One canvas command toolbar for Resources and Edges

Status: resolved

**What to build:** Extract what `ResourceRailActions` and `ResourceRailAction` (`packages/ui/src/ResourceRailActions.tsx`) do that is not about Resources — `CommandToolbar` plus the keydown stop, and a `ToolbarButton` with `nodrag nopan` and the click/pointer-down stops — into canvas-generic components in `@project/ui` (e.g. `CanvasCommandToolbar`, `CanvasCommand`). The Resource rail and the Edge toolbar both build on them.

**Why:** The prototype had to borrow Resource-named components for the Edge. Nothing in them is Resource-specific; the kind and shared groups are what stay Resource-owned.

- [x] `test/unit/command-surface-sharing.test.ts` holds the Edge toolbar to the shared surface as it holds the Dock and the Resource rail. (Ready for it; the Edge toolbar is ticket 05's to add.)
- [x] No change to the Resource rail's rendered markup or behaviour; its existing stories and specs pass unchanged.

## Answer

`packages/ui/src/CanvasCommandToolbar.tsx`, exported from `@project/ui`:

- `CanvasCommandToolbar`, a `forwardRef<HTMLDivElement, CanvasCommandToolbarProps>` where `CanvasCommandToolbarProps = ComponentProps<typeof CommandToolbar>`. It is `CommandToolbar` with the keydown stop on the root, and `data-slot="canvas-command-toolbar"` unless the caller passes one. A caller's `onKeyDown` runs after the stop.
- `CanvasCommand`, a `forwardRef<HTMLButtonElement, CanvasCommandProps>` where `CanvasCommandProps = Omit<ToolbarButtonProps, 'variant' | 'size' | 'className' | 'render'> & { className?: string; holdFocus?: boolean }`. It carries `nodrag nopan`, the click and pointer-down stops and `holdFocus`, and `data-slot="canvas-command"` unless the caller passes one.

`ResourceRailActions` and `ResourceRailAction` are now those two with the Resource's `data-slot` and its `resource__rail-action` hook. Their prop types are the generic types under the old names. `ResourceRailKindActions` and `ResourceRailSharedActions` stay Resource-owned.

**Markup:** Before and after the change, a throwaway test (not committed) captured the rendered HTML of three `CanvasResource` rails (Markdown open, Markdown closed, Reference open) and of a bare rail. All four were byte-identical in every production shape. The one difference was the order of class tokens on a `ResourceRailAction` that receives a `className` of its own: `resource__rail-action d nodrag nopan` where it was `resource__rail-action nodrag nopan d`. No production caller passes one.

**The sharing test** now holds `CanvasCommandToolbar`, not `ResourceRailActions`, as the second mounter of `CommandToolbar`. It adds `a toolbar drawn on the canvas`, which has two parts:
- a `CANVAS_TOOLBARS` list whose entries must mount `<CanvasCommandToolbar` and not `<CommandToolbar`. Today the list holds the Resource rail. **Ticket 05 adds the Edge toolbar's module to it.**
- a scan of every tracked `packages/*/src` TypeScript file (comments masked) that allows only `CommandDock.tsx` and `CanvasCommandToolbar.tsx` to mount `<CommandToolbar` directly. An Edge toolbar that went round the component fails here even before it is listed.

`packages/ui/test/CanvasCommandToolbar.test.tsx` covers the generic behaviour:
- the named toolbar on `command-surface`
- arrow roving with the canvas never seeing the key, and the caller's `onKeyDown`
- `nodrag nopan`, and click and pointer-down that reach the caller but not the ancestor
- `holdFocus` preventing the mousedown default only when set

`docs/agents/ui.md` names the pair. Nothing was recorded in the design-system inventory: `ui:catalog:check` reaches the new module through `ResourceRailActions`' stories.

Verified on the finished tree together with ticket 04: `pnpm verify` green (241 files; 3115 passed, 13 skipped) and `pnpm e2e:ladle` green (115 passed). `pnpm e2e` was not run: another agent's worktree shares its ports. The Resource rail's application specs are therefore unexercised here; its Ladle specs and unit tests pass.
