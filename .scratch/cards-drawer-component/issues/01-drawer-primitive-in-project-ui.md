# 01 — A `Drawer` in `@project/ui`, composed from Base UI's Drawer

Status: resolved
Blocked by: none

**What to build:** `packages/ui/src/components/drawer.tsx`, a shadcn-style wrapper over
`@base-ui/react/drawer`, exported from the `@project/ui` barrel.

The wrapper is the smallest one that covers this repository's use: `Drawer`,
`DrawerTrigger`, `DrawerPortal`, `DrawerViewport`, `DrawerPopup`, `DrawerContent`,
`DrawerHeader`, `DrawerTitle`, `DrawerDescription`, `DrawerClose`. No backdrop part, no
snap points, no indent, no nested-drawer styling — none has a consumer, and a part
nothing composes is a part nothing tests.

- [x] `DrawerPopup` takes `side` (`'left' | 'right'`, default `'right'`) and drives its
      edge, border and slide transform from `data-side`, the way `sheet.tsx` already
      does for its own side prop.
- [x] The popup translates by `--drawer-swipe-movement-x` so a swipe tracks the pointer,
      and returns to rest through one transition.
- [x] `DrawerViewport` is `fixed inset-0` and `pointer-events-none`, with the popup
      restoring `pointer-events-auto`. A non-modal drawer's viewport covers the screen;
      without this it swallows every click on the canvas behind it.
- [x] Every part carries a `data-slot` attribute, uses `cn`, and takes the Base UI
      part's own props type. No prop is invented that Base UI already names.
- [x] Exported from `packages/ui/src/index.ts` with its prop types.
- [x] `packages/ui/test/drawer.test.tsx` proves, through roles and user behaviour:
      the trigger opens it; Escape closes it; focus returns to the trigger on close;
      the popup is a `dialog` named by its `DrawerTitle`; `disablePointerDismissal`
      keeps it open across a press outside it.

**Why a wrapper and not `@shadcn/drawer`:** the registry component is vaul (Radix). This
repository has no Radix and no vaul; `packages/ui` depends on `@base-ui/react` alone and
`components.json` pins `base-nova`. Adopting it would stand up a second dialog, focus and
animation stack beside the one every other surface uses. Base UI supplies the primitive,
so the shadcn-first workflow's step 8 applies.
