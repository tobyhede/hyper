# 05 — Popover and Card endpoint editing migration report

Ticket 05 moves Hyper's shared Popover composition from Radix to Base UI 1.7.0.
The connection target picker and selected-Edge endpoint editor continue to use
the existing `CardCombobox` and cmdk Card-choice model.

## Preserved contract

- `PopoverContent` portals the popup and keeps the `nokey` class on the
  portalled surface, so React Flow's document-level deletion shortcut does not
  receive typing or delete keys from either Card picker.
- Escape dismisses an open Card-choice list before its surrounding authoring
  interaction; Base UI returns keyboard focus to the trigger.
- Choosing an eligible Card closes the picker and calls its existing
  `onValueChange`; refused Cards, title filtering, accessible names and cmdk
  keyboard navigation are unchanged.
- The selected-Edge Edit command opens the two endpoint fields, and choosing an
  endpoint still reaches Edge Authoring rather than a local React Flow change.

## Base UI anatomy and compatibility boundary

`PopoverContent` now composes `Portal`, `Positioner`, and `Popup`. Positioning
props (`anchor`, `side`, `align`, offsets and collision controls) are forwarded
only to `Positioner`; popup props stay on `Popup`.

Base UI does not have Radix's `Anchor` part. `PopoverAnchor` remains an explicit
inert compatibility export: it adds no DOM and is documented as a bridge rather
than a migration claim. The only former consumer, the Edge toolbar, now holds a
ref to its toolbar anchor and passes it as `PopoverContent`'s Base UI `anchor`
prop. This is the required non-trigger-anchor form for Base UI positioning.

No migrated Popover or endpoint-consumer source imports Radix or uses Radix
composition props.

## Verification

- TDD: the CardCombobox Escape tracer was written before the Base UI
  composition; it covers the portalled key guard, close, and keyboard focus
  return at the public Card-choice seam.
- `pnpm exec vitest run packages/ui/test/CardCombobox.test.tsx packages/app/test/edge-authoring-react.test.tsx` — 45 passing.
- `pnpm --filter @project/ui typecheck`
- `pnpm --filter @project/app typecheck`
- `pnpm build`
- Isolated Chromium E2E: `pnpm exec playwright test packages/app/e2e/editing.spec.ts --project=chromium --grep "selected Edge offers a toolbar|Edge editor moves an endpoint"` — 2 passing.

The isolated browser run opens the selected Edge toolbar, exposes both endpoint
pickers, and changes an endpoint through the popup. It uses an E2E-owned Vite
host and does not touch the human's development server.
