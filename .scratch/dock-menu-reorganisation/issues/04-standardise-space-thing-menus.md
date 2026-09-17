# 04 — Reorganise the Space Thing entity menu

**What to build:** Reorder the Space Thing entity menu and remove Rename from it. Title editing stays on the Thing front. Apply the same grouping wherever that menu is exposed, including dropdown and context-menu presentations. This is reorganisation: reorder, plus one removal. Every remaining command keeps its current effect, destination, availability and reporting. Do not add a command that renames the target Space. Diagram and Graph menus on an Open Space Thing are ticket 01, not this one.

**Blocked by:** None — can start immediately

**Status:** done

- [x] A placed Space Thing's menu shows these groups in order, with one separator between groups: Create Alias; Enter, Open in New Tab; Copy link to Thing in Diagram, Copy link to Thing, Copy link to Space; Remove from Diagram, Delete from Space.
- [x] Labels match those above. Rename is absent. Delete from Space occupies the final destructive group with Remove from Diagram.
- [x] The Space Thing's Title still edits on the Thing front. This menu does not rename the Thing and does not rename the target Space.
- [x] Create Alias uses the Space Thing as its immutable Target, completes creation on activation, copies its Title once and continues in the new Alias's Title editor.
- [x] Enter and Open in New Tab keep their current operations and outcome reporting.
- [x] The three copy commands copy the same destinations they copy today. Clipboard outcomes remain accurately reported.
- [x] Remove from Diagram removes the Space Thing's placement and incident Edges from the current Diagram; it does not delete the target Space. Delete from Space retains its existing confirmation and lifetime meaning. Where the Thing is not placed, omit the inapplicable within-Diagram link and removal command without leaving empty groups or redundant separators.
- [x] Use the shared entity action grouping and UI menu primitives, following shadcn-first-ui. Dropdown and context-menu presentations share the command definitions and remain operable by pointer and keyboard.
- [x] Application and Ladle behaviour evidence verifies ordered groups and boundaries, the absence of Rename, Alias creation, both navigation commands, all three copied destinations, removal, and Delete from Space.

**Implementation notes:** `thingRailActions`'s `thing.kind === 'space'` branch in `packages/app/src/App.tsx` dropped its own `rename` `EntityActionGroup` (and the now-unused `EditIcon` import); the concatenation changed from `[[...rename, ...alias], [...enter, open-independently], links, leaving]` to `[alias, [...enter, open-independently], links, leaving]`. Nothing else in that function changed — `entity-actions.tsx`'s `spaceEntityActions` (the address/copy-link builder) and its placement-conditional link forms were already correct and untouched. Dropdown (`EntityActionsTrigger`) and context menu (`EntityActions`) in `packages/ui/src/CanvasThing.tsx` already share one `EntityActionGroup[]`, so both presentations pick up the new order by construction — no changes needed there.

A pre-existing e2e helper, `exerciseFloatingThingDock` in `packages/app/e2e/space-thing-frame.ts`, asserted a `Rename` row was visible in the Space Thing actions menu; that assertion was swapped for `Create Alias`, which is unrelated to this ticket's own scope but was a stale check the removal broke.

Application unit coverage of the exact order (with `Enter` withheld, since that isolated single-Space harness carries no `OpenSpacesContext`) and of the front title editor still working live in `packages/app/test/thing-rail-actions.test.tsx`. `packages/app/test/enter-space-thing.test.tsx` adds the full order including `Enter`, through the real `OpenSpacesApplication` composition. `packages/app/e2e/space-thing-context-menu.ts`'s shared `exerciseSpaceThingEntityMenu` helper (consumed by both `packages/app/e2e/space-thing.spec.ts` and `packages/app/ladle-e2e/space-thing-embedded-diagram.spec.ts`, both tagged `@parity:space-thing-entity-menu`) now renames the Space Thing through its front Edit Title control instead of a menu Rename row, and asserts the new order with Rename absent. `packages/app/ladle-e2e/command-dock.spec.ts` adds a Ladle-e2e-only grouping test against the fixture's placed "Design system" Space Thing (through the real production host). `packages/app/stories/parity-claims.ts`'s `space-thing-entity-menu` claim text was updated to describe the new grouping.
