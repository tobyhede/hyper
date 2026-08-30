# 03 — `App.tsx` stops owning the drawer's toggle and its width

Status: resolved
Blocked by: 02

**What to build:** the shell composes one `CardsDrawer` and nothing else.

- [x] The `Cards` `Button` in the `AppShell` header is replaced by the drawer's own
      `DrawerTrigger`. `cardsDrawerAvailable` becomes the trigger's `disabled` and the
      one condition that decides whether the drawer is composed at all — it already
      exists for exactly that reason and the comment above it says so.
- [x] The canvas's flex row loses its second child. The drawer is portalled and
      overlays the right edge, so the canvas keeps its width and its Cards do not
      re-measure on a toggle that says nothing about the Layout.
- [x] Closing the drawer whenever `cardsDrawerAvailable` goes false stays true —
      presenting, opening a Card and creating an Alias each still withdraw it — and the
      reveal-once-per-`(renderer, address)` guard is untouched.
- [x] `packages/app/test/SpaceApp.test.tsx`'s drawer coverage still passes unchanged, or
      changes only where it asserted the old flex layout.

**Why:** the toggle's `disabled` and the drawer's mount already read one shared
condition precisely because they could drift apart. Composing the trigger inside the
drawer removes the possibility rather than commenting on it.
