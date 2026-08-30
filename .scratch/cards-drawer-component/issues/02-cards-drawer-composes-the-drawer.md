# 02 — `CardsDrawer` composes `Drawer` instead of a second `Sidebar`

Status: resolved
Blocked by: 01

**What to build:** `packages/app/src/components/CardsDrawer.tsx` rendered as a `Drawer`,
owning no layout width in the shell and needing no `SidebarProvider`.

- [x] The component takes `open` and `onOpenChange` and renders its own trigger through
      `DrawerTrigger`, so the toggle and the panel are one component rather than a
      button in `App.tsx` and a panel 850 lines below it that must agree by hand.
- [x] `modal={false}` and `disablePointerDismissal`: the canvas stays interactive, and
      neither a press on it nor focus moving to it closes the drawer.
- [x] `swipeDirection="right"`, with `data-base-ui-swipe-ignore` on the scrolling Card
      list so a press on a Card starts its HTML5 drag rather than a swipe.
- [x] A `DrawerTitle` of "Cards" names the dialog; the filter and search controls keep
      their existing accessible names unchanged.
- [x] A `DrawerClose` control ends it, alongside Escape and the trigger.
- [x] Everything the drawer *lists* is unchanged: the same alphabetical ordering with
      stable Space order as tie-breaker, the same kind filter, the same Alias-Target
      search, the same three empty messages, the same `CARD_DRAG_TYPE` payload, the same
      `Add <Title> to Layout` button names, and the same `revealedCardId` treatment.
- [x] `packages/app/test/CardsDrawer.test.tsx` drops its `SidebarProvider` wrapper and
      gains coverage for opening, Escape, and the drag payload.

**Why:** `Sidebar` is ADR 0053's command surface and owns the left edge. Composing a
second one on the right made the Cards drawer share the shell's `SidebarProvider` — its
open state, its `Ctrl/Cmd-B` shortcut, its mobile `Sheet` — and left the panel with no
dismissal contract, no focus contract, no accessible name and no transition.
