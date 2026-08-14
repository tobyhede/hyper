# Select migration report

Ticket 04 moves the shared Select wrapper and its View, Layout and Active Graph
consumers from Radix Select to Base UI 1.7.0.

## Preserved contract

- The shared wrapper keeps its public `Select`, `SelectTrigger`,
  `SelectContent`, `SelectItem`, `SelectGroup`, and `SelectValue` exports.
- View, Layout and Graph selectors retain their controlled values, accessible
  names, titles, test ids, labels, callbacks, authored ordering, inactive View
  presentation, Layout live indicator, and Graph colour affordances.
- Base UI's native `null` value is now the explicit controlled empty state for
  the inactive View and missing Layout or Graph; callbacks ignore its null
  clear value because Hyper has no clear-selection action.
- The portalled popup and toolbar trigger both retain `nokey`, preserving the
  boundary that keeps React Flow's document-level delete shortcut out of
  selector controls.

## Primitive and styling change

The wrapper now composes Base UI's `Root`, `Trigger`, `Icon`, `Portal`,
`Positioner`, `Popup`, `List`, `Item`, and `ItemText` parts. Positioning props
land on `Positioner`; the popup uses Base UI's `--available-height` and the
list uses `--anchor-width`. Item selection styling now follows Base UI's
`data-selected` state. No Radix Select imports, CSS variables, state attributes,
or composition props remain in the wrapper or selector consumers.

## Verification

- `pnpm exec vitest run packages/ui/test/ViewSelector.test.tsx packages/ui/test/LayoutSelector.test.tsx packages/ui/test/GraphSelector.test.tsx`
- `pnpm exec tsc --noEmit -p packages/ui/tsconfig.json`
- `pnpm build`

The focused tests cover pointer selection (using Base UI's real pointer-down
gesture), keyboard opening/navigation, controlled null-to-id transitions,
empty/inactive presentation, Graph colours, and the portalled `nokey` marker.

## Manual keyboard and focus check

In a browser, tab to each selector, open it with Enter, Space and arrow keys,
move between options with the arrow keys and typeahead, then select with Enter
or Space. Confirm Escape closes each list and restores focus to its trigger.
With a selected Edge on the canvas, press Backspace and Delete while the
selector trigger and the open portalled list hold focus; neither should delete
the Edge.
