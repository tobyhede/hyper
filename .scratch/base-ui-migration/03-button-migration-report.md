# Button migration report

Ticket 03 moves `@project/ui`'s shared `Button` wrapper from a handwritten
native element to Base UI 1.7.0's `Button` primitive.

## Preserved contract

- `default`, `secondary`, and `destructive` retain their existing Hyper palette
  classes; `secondary` remains the default variant.
- The wrapper still supplies `type="button"` unless a caller explicitly
  supplies another type. The Open Card editor's `Done` button therefore remains
  a submit button, while its Cancel button remains a non-submitting action.
- Disabled behavior, caller-supplied layout classes, and `HTMLButtonElement`
  ref forwarding are covered by the focused Button test.
- The underlying component is now Base UI's native-button primitive. No user
  visible behavior delta was intended or found in focused tests.

## Consumer sweep

`AddCardControl` continues to use the wrapper for both halves of its split
control, including its `HTMLButtonElement` menu-trigger ref. `App` uses it for
persistence actions; `NewAlias` uses it for Cancel; `OpenCard` uses it for
Cancel and explicit form submit. None needed source changes for this migration.

## Verification

- `pnpm vitest run packages/ui/test/Button.test.tsx packages/ui/test/AddCardControl.test.tsx packages/app/test/OpenCard.test.tsx`
- `pnpm typecheck`
- `pnpm --filter @project/ui typecheck`
- `pnpm --filter @project/app typecheck`
- `pnpm build`

## Manual keyboard and focus check

In a browser, tab to a primary, secondary, destructive, and disabled shared
button; verify the focus treatment on enabled controls and that disabled
controls do not activate. Activate enabled controls with Enter and Space. In
the Card editor, confirm Cancel does not submit and Done does submit. Open and
dismiss the Add Card menu, then confirm focus returns through its forwarded
trigger ref.
