# 04 — Parity evidence for the drawer's own behaviour

Status: resolved
Blocked by: 03

**What to build:** ADR 0052 evidence for what the Drawer adds, in both halves.

- [x] `packages/app/stories/surfaces/cards-drawer.stories.tsx` mounts the production
      `CardsDrawer` closed, with its own trigger, over a stand-in canvas — the smallest
      coherent boundary that owns opening, dismissal and the overlay. Its
      `SidebarProvider` wrapper goes: the component no longer needs one.
- [x] A second parity claim, `cards-drawer-opens-and-dismisses-without-locking-the-canvas`,
      covering: the trigger opens a `dialog` named "Cards"; Escape closes it and returns
      focus to the trigger; a press on the canvas behind it neither closes it nor is
      swallowed by the viewport.
- [x] Ladle evidence in `packages/app/ladle-e2e/cards-drawer.spec.ts`, tagged with that
      claim id. The existing `cards-drawer-adds-existing-layout-members` test opens the
      drawer first and is otherwise unchanged.
- [x] Application evidence in `packages/app/e2e/editing.spec.ts`, tagged the same way,
      driving the real drawer in the real app.
- [x] `pnpm ui:catalog:check` green.

**Why:** the drawer's dismissal, focus return and non-blocking overlay are new
browser-observable behaviour. ADR 0052 wants each stable-story claim proved twice, and
the existing claim is about what the drawer *lists*, not about the drawer.
