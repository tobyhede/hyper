# 09 — Contract the old Map command interface

Status: resolved
Blocked by: 07, 08

**What to build:** Make the Command Dock and embedded Space Resource rail consume the completed `MapAuthoringCommands` capabilities directly. Remove the separate Map create/delete availability flags, duplicated callbacks and Map-specific coordination paths that the deep module replaces. Keep selection, Copy link, focus, report lifetime and visible treatment with their existing owners.

**Why:** Tickets 06–08 expand the new form beside the old so each operation can land green. This ticket completes the refactor: the old interface and tests disappear only after every Map Edit crosses the new seam.

- [x] Each surface derives unavailable treatment and invocation from one paired capability; no separate Map availability flag can disagree with its operation.
- [x] The old top-level and embedded Map command callbacks and Map-specific coordination paths are deleted without changing Graph command behavior.
- [x] Superseded helper tests are removed once the shared adapter contract covers their behavior; tests that prove distinct treatment remain.
- [x] The Command Dock retains the exclusive Map selection, addressing remains beside authoring, and caret continuation remains surface-owned.
- [x] The deletion test holds: removing `MapAuthoringCommands` would redistribute availability, coordination, persistence ordering, recovery and report translation across both callers.
- [x] Static verification, application end-to-end tests and Ladle behavior tests are green.


## Comments

**2026-09-23, resolved.** `pnpm verify`: every static step green (toolchain, both typechecks, `ui:catalog:check`, lint, anti-slop, format); `test:coverage` ran 237 files, 3113 passed and 13 skipped, with one timeout under machine load — `space-resource-embedded-map.test.tsx`'s "reports embedded failed persistence…" at 5000 ms — whose file passes alone (24/24). `pnpm e2e:ladle`: 115 passed. `pnpm e2e` was not run by this ticket's agent; the coordinator runs it for the branch (it is CI's too).

- **One field per Map command, built from one capability.** `offered(capability, press)` in `map-authoring-commands.ts` answers the surface's press built from the capability's own `invoke`, or `null` where `available` is false. Both surfaces spend every Map command through it, so the row's unavailable treatment and its invocation are one answer and cannot disagree. `map-authoring-commands.test.ts` holds `offered` itself.
  - **Dock.** `DockCanvas` loses `createDisabled` and `deleteDisabled`: `onCreate` and `onDelete` are now `(() => void) | null`, like `onRename`, which now takes only the title because the Dock only ever names the drawing Map — the Map the top-level capabilities address. `MapControls` passes `canvas.onRename` straight through, and `deleteDisabled || maps.length <= 1` is gone: the last-Map rule is the capability's.
  - **`@project/ui`.** `MapMenuActionsProps` takes `onCreate`/`onDelete` as `(() => void) | null` in place of `createDisabled`/`deleteDisabled` beside them. `GraphMenuActionsProps` states its own fields rather than extending the Map props, and Graph's props are unchanged. The rail's `CanvasSpaceResourceCommands` is renamed `CanvasSpaceResourceMapCommands`, and its `onRename`, `onCreate` and `onDelete` are nullable. `CanvasSpaceResourceGraphCommands` keeps the old shape as its own interface, so Graph behaviour does not change. `SpaceResourceSelector` adapts both into one private `SelectorCommands` shape. `ui` still names no app type.
- **Caret apart from sentence (07's concern).** The rail's Map `onCreate` resolves a boolean: whether the caret went on into the new Map's name. It no longer returns a string that did both jobs. `SelectorCommands.create` answers `{ continued, report }`. Before, an `unavailable` or `unchanged` creation left `movedCaret` set. Now it is set to `continued`. A Graph creation answers `continued: false` with its sentence, as before.
- **Decision: the rail says no local sentence for a refused Map creation or deletion.** The containing canvas's command outcomes already say it as a notice ("Map not created", "Map not saved", "Map not selected", "Map not deleted"). A second copy in the Resource's context notice would outlive that notice's dismissal. Command outcomes owns the report's lifetime, per the spec. So the Map `onCreate` and `onDelete` answer no sentence, and the rail clears its context notice when either settles. **A refused Map rename is still said in both places, deliberately.** The inline sentence is not a report. It is the editor's own treatment, holding the refused draft open (`InlineTitleEditor`), and it ends when the editor does. The notice is the report. This settles 06's question the same way for the Dock and for the rail. Graph commands still report on the rail, because Graph outcomes are not on command outcomes there.
- **Removed.** `spaceEntityActions`' `onDeleteMap` option is gone, along with `DELETE_MAP_ACTION_ID`, the Map arm's Delete group, the two stories' and App's `onDeleteMap: null`, and the `entity-actions.test.ts` Delete cases: the destructive-variant assertion and the done/failed answer. The Map arm is now Rename and Copy link. App's `renameChromeTitle` loses its Map branch, and its subject type excludes `map`. `coordinated-context-delete.ts`'s private `run` is inlined into `coordinatedGraphDelete`, its one caller. `coordinated-context-create.ts` stays, and its doc now says Graph creation is its only caller. Its tests stay because they test Graph behaviour. `coordinated-context-delete.test.ts`'s source scan now holds that App deletes through `offered(mapAuthoring.map(selectedMap.map.id).delete, …)` and `commandOutcomes.run('map-delete', remove)`.
- **Tests added.** `SpaceResourceSelectors.test.tsx`: withheld Map commands draw New Map, Rename and Delete unavailable while Copy link stays available. A Map creation reports no sentence while a Graph creation's refusal still does. `space-resource-context-commands.test.ts`: the rail offers each Map command while it is available and none while it is withdrawn, and a Map creation answers `true` once the continuation is requested. `space-resource-embedded-map.test.tsx`: a refused rail Map deletion is said once, as the containing Space's "Map not deleted" notice. After dismissal, no copy of the sentence remains.
- **The deletion test.** Remove `MapAuthoringCommands` and each caller gets back:
  - the last-Map, addressing and general-availability rules. The Dock would need its `maps.length <= 1` again, and the rail its `deleteDisabled`.
  - the embedded before/after persistence waits and the selection write.
  - the survivor preference.
  - the refusal-to-report translation under four titles.
  - the invocation-time rechecks.
  
  Both callers now hold only the press: where the outcome is published, and where the caret goes.

