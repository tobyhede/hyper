# Add Card dropdown-menu migration report

Ticket 06 moves the Add Card split control's Alias menu from Radix Dropdown Menu
to Base UI 1.7.0 Menu.

## Preserved behavior

- Add Card remains the primary, immediate action; it announces only the caller's
  keyboard shortcut and never opens a menu.
- The secondary trigger remains named **More Card kinds**, retains its disabled
  state and forwarded `HTMLButtonElement` ref, and keeps the split-control
  geometry.
- Base UI owns the trigger, portal, positioner, popup, item keyboard navigation,
  Escape dismissal and normal focus return. The menu is explicitly non-modal,
  matching the toolbar's existing interaction with the rest of the workspace.
- Choosing Add Alias still opens Alias creation. That is the one close for which
  the popup returns `finalFocus={false}`: the newly mounted Target picker owns
  focus, while ordinary dismissal uses Base UI's default return-to-trigger
  behavior. Cancelling Alias creation still returns focus through the supplied
  trigger ref.

## Behavior delta

There is no intended browser behavior delta. Base UI preserves the native
button's Enter activation path, so jsdom tests now complete its synthetic
keydown with the native click it would receive in a browser. Base UI dispatches
a `PointerEvent` for keyboard-activated menu items; the focused jsdom test
supplies that missing platform constructor. Neither is application behavior.

## Consumer sweep

`App` remains the owner of Alias-pane focus return through `menuTriggerRef`.
No consumer source changed. The focused app Card-creation suite proves opening
Alias creation, cancelling it and returning focus to the trigger.

No Radix import, `asChild`, `onSelect`, or `onCloseAutoFocus` composition remains
in `AddCardControl`.

## Verification

- `pnpm vitest run packages/ui/test/AddCardControl-base-ui.test.tsx packages/ui/test/AddCardControl.test.tsx packages/app/test/card-creation.test.tsx`
- `pnpm typecheck`
- `pnpm --filter @project/ui typecheck`
- `pnpm --filter @project/app typecheck`
- `pnpm build`

## Manual pointer and keyboard check

In a browser, click Add Card and confirm immediate Card creation without a menu.
Open More Card kinds with pointer, Enter, Space and Arrow Down; navigate to Add
Alias with arrows and select it with Enter. Confirm the Target picker receives
focus, Escape/outside dismissal returns focus to More Card kinds, and cancelling
Alias creation also returns focus there. Confirm both halves remain unavailable
while Card authoring is disabled.
