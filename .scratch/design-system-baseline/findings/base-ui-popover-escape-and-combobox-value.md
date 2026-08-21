# A selected `CardSearchCombobox` suppresses Base UI Popover Escape

Found while building issue 06's Ladle evidence for the selected-Edge endpoint
editor, against `@base-ui/react` 1.7.0 and Chromium (Playwright's bundled
build). Recorded here because the workaround in
`packages/app/src/components/SelectedEdgeControls.tsx` cites it, and because a
future Base UI upgrade should retest it before the workaround is removed.

## What happens

A `Popover.Root` whose popup contains a `CardSearchCombobox` **with a selected
`value`** stops closing on Escape. `onOpenChange` is never called. The same
popover with the same combobox and `value={null}` closes normally, and an
outside press closes it in both cases — so the popup's dismissal is live and
only the Escape branch is suppressed.

The endpoint editor is always in the failing case: both pickers name the Card
the Edge currently points at, which is the whole reason the fields open on a
value rather than empty.

## How it was measured

A throwaway `Review/Popover Probe` story mounted `Popover` + `PopoverContent`
(anchored, and again with a real `PopoverTrigger`) around varying children, and
a throwaway Ladle spec pressed Escape and counted the popup:

| Popup contents | Closes on Escape |
| --- | --- |
| a plain `<button>` | yes |
| one `CardSearchCombobox`, `value={null}` | yes |
| two `CardSearchCombobox`, both `value={null}` | yes |
| one `CardSearchCombobox`, `value="a"` | **no** |
| two `CardSearchCombobox`, both with a value | **no** |

Anchored and triggered popovers behaved identically, so it is not the missing
`Popover.Trigger`.

Instrumenting `onOpenChange` confirmed it is never invoked by the Escape press
and is invoked by an outside press in the same session.

## What was not established

Why. `useDismiss`'s `closeOnEscapeKeyDown` has three early returns — closed or
disabled, IME composition, and `hasBlockingChild('__escapeKeyBubbles')` — and
the third is the plausible one: a Combobox carrying a value may leave a child
node in the floating tree reporting `open`. That was not confirmed in the
running bundle, so treat it as the lead rather than the cause.

## The workaround

`SelectedEdgeControls` handles Escape itself, in the **capture** phase, and
defers to an open list by reading `[role="combobox"][aria-expanded="true"]`
inside the popup. Capture is load-bearing: Base UI closes the list from a
bubble-phase `document` listener, and the microtask checkpoint between listeners
commits that close before React's delegated bubble listener runs — so a bubble
handler would read the list as already closed on the first press and collapse
both layers into one.

The Ladle spec
`packages/app/ladle-e2e/issue-06-graph-hud-and-edge-controls.spec.ts` pins both
presses. Retest the table above on the next `@base-ui/react` upgrade; if the
Escape branch works again, the handler becomes redundant rather than wrong, and
removing it should be a deliberate change with that spec still green.
