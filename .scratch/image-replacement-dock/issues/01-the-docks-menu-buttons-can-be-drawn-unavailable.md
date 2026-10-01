# 01: The Dock's menu buttons can be drawn unavailable and stay in the keyboard order

**What to build:** Each of the Command Dock's menu buttons — the Space, Map and Graph names and Open Spaces — can be drawn unavailable the way ADR 0073 asks of a toolbar item: it announces itself unavailable through `aria-disabled`, keeps its place in the arrow order, and does not open its menu. Today nothing draws them unavailable except a native fieldset, which takes the whole Dock off the keyboard. If Base UI's toolbar already gives a menu trigger this behaviour when it is disabled, this ticket is the proof of it; if it does not, the smallest change goes into `@project/ui`, by composition first (`$shadcn-first-ui`), and no hand-rolled workaround goes into the application. A `ToolbarGroup`'s `disabled`, which withholds a set at once, is a candidate to consider.

**Blocked by:** None (can start immediately)

**Status:** resolved

Test seams (confirmed): the `@project/ui` menu trigger and toolbar components through their roles, and the Command Dock story in Ladle.

- [x] A disabled Dock menu button reports `aria-disabled="true"` and is not natively disabled.
- [x] Arrow keys reach a disabled menu button and move past it in order.
- [x] Activating a disabled menu button by pointer, Enter or Space opens nothing.
- [x] Unit assertions read `aria-disabled`, never `toBeDisabled` (ADR 0073).
- [x] Any `@project/ui` change carries a Ladle story proof and passes `pnpm e2e:ladle` (ADR 0052).

## Resolution

Base UI already does it. A `Menu.Trigger` rendered through a `ToolbarButton` is a composite item of the toolbar, so given `disabled` it reports `aria-disabled="true"`, keeps the native property off, stays in the arrow order and opens nothing. `@project/ui` needed no source change; `packages/ui/test/toolbar-menu-trigger.test.tsx` holds it for both compositions the Dock draws (`ChoiceMenuTrigger` and `DropdownMenuTrigger`, each `render={<ToolbarButton />}`), reading `aria-disabled` and never `toBeDisabled`.

`ToolbarGroup`'s `disabled` was considered and does not serve: with the trigger outermost, a disabled group refuses the press but the trigger still reports `aria-disabled="false"`. So `disabled` goes on each trigger.

The Dock wires it as `menuDisabled` on `SpacesControl` (the Space name and Open Spaces), `MapControls`, `GraphControls` and `IdentitySurface`, which `CommandDock` drives from its `disabled` prop. Ticket 02 drives it from the `navigate` answer instead.

The `Replacing` Command Dock story holds a replacement through the real `imageReplacement` activity, and claim `command-dock-draws-its-menu-buttons-unavailable` has proofs in `ladle-e2e/command-dock.spec.ts` and `e2e/image-resource.spec.ts`. While `App` keeps the Dock inside its fieldset, the buttons are natively disabled as well. Keyboard reach inside the Dock can only be seen once ticket 02 removes that fieldset. Until then it is proven at the `@project/ui` seam.
