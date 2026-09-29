# 01: The Dock's menu buttons can be drawn unavailable and stay in the keyboard order

**What to build:** Each of the Command Dock's menu buttons — the Space, Map and Graph names and Open Spaces — can be drawn unavailable the way ADR 0073 asks of a toolbar item: it announces itself unavailable through `aria-disabled`, keeps its place in the arrow order, and does not open its menu. Today nothing draws them unavailable except a native fieldset, which takes the whole Dock off the keyboard. If Base UI's toolbar already gives a menu trigger this behaviour when it is disabled, this ticket is the proof of it; if it does not, the smallest change goes into `@project/ui`, by composition first (`$shadcn-first-ui`), and no hand-rolled workaround goes into the application. A `ToolbarGroup`'s `disabled`, which withholds a set at once, is a candidate to consider.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

Test seams (confirmed): the `@project/ui` menu trigger and toolbar components through their roles, and the Command Dock story in Ladle.

- [ ] A disabled Dock menu button reports `aria-disabled="true"` and is not natively disabled.
- [ ] Arrow keys reach a disabled menu button and move past it in order.
- [ ] Activating a disabled menu button by pointer, Enter or Space opens nothing.
- [ ] Unit assertions read `aria-disabled`, never `toBeDisabled` (ADR 0073).
- [ ] Any `@project/ui` change carries a Ladle story proof and passes `pnpm e2e:ladle` (ADR 0052).
