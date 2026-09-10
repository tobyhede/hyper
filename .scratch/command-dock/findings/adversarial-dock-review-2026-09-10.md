# Adversarial Dock review — 2026-09-10

Status: resolved

Scope: the Command Dock promotion since `a2082964935625c1a36ddd8ac45a5bc9aafb4352`, through `2f100ceb`, including current uncommitted Dock changes. Reviewed using shadcn, shadcn-first-ui, code-review, and vercel-react-best-practices. Independent Standards and Spec reviews were followed by root verification. This report records findings; it does not implement their fixes.

## Standards

### P2 — The grip accepts a secondary-button drag

`packages/app/src/components/CommandDock.tsx:2180` starts a gesture for every pointer down. It does not filter the mouse button, check an existing gesture, or retain a pointer ID for subsequent move/up ownership. This custom interaction bypasses the primitive's trigger behavior and must therefore own these semantics completely.

Browser reproduction: right-button down on the grip, drag, right-button up. The accessible position changed from “Top edge, centre” to “Right edge, middle”. This is a confirmed live defect. Multiple-pointer takeover is an additional source-level risk, not separately reproduced.

Fix direction: guard initiation and retain/check the initiating pointer's identity, with cancellation and secondary-pointer coverage.

### P2 — The generic menu does not enforce the type its callback promises

`packages/ui/src/components/dropdown-menu.tsx:245` types a group's callback using its supplied value, while the item's independent generic at line 289 cannot inherit the group type through JSX. The Dock's Layout items at `packages/app/src/components/CommandDock.tsx:796` do not explicitly bind that type. The Graph and Space call sites use the same pattern.

Compiler reproduction: TypeScript 7 accepts a LayoutId group with a literal `"none"` item while its callback is declared to receive LayoutId. The probe uses no assertion. Thus the wrapper's comment that the group absorbs the untyped boundary is stronger than what it enforces. Current mapped items contain valid IDs; this is an unsafe composition contract, not evidence of corrupt current input.

Fix direction: bind items to the group's type at each composition, or provide a typed options API that owns group and items together. A foundation finding already recorded the underlying limitation; making the item generic did not bind these Dock call sites.

### P2 — Dock CSS still overrides shared Button appearance

`packages/app/src/components/command-dock.css:387` overrides open disclosure foreground/background, and line 448 overrides the parent ToolbarButton foreground. These are controls drawn by the shared Button recipe but restyled through application selectors.

This conflicts with `.agents/skills/shadcn/rules/styling.md` (“className for layout, not styling”) and shadcn-first-ui's preference for variants, theme, or composition. It leaves a second owner of Button appearance after the Space-name typography fix.

Fix direction: put the documented open/parent treatments into explicit shared variants or state styling owned by the component. This is a standards finding; no additional browser malfunction is claimed.

## Spec

### P2 — A short vertical Dock overflows instead of scrolling

`packages/app/src/components/command-dock.css:116–135` caps the outer frame's height but applies vertical scrolling to its unconstrained child surface. The child retains its content height, so it has no scrollable viewport.

Browser reproduction after allowing the move animation to settle: at viewport 844×220, move to Left edge / Middle. The outer frame is 160px high; the surface's clientHeight and scrollHeight are both 197px. Its top is 30px and bottom 229px, beyond the 220px viewport. The snapshot is in `../review-probes/dock-short-viewport.png`.

Ticket 07 requires responsive behavior, and ADR 0082 requires “Everything it offers is reachable and operable from the keyboard alone.” Constrain the scrolling surface itself and add a short-height vertical test. Existing portrait phone evidence does not cover this case.

## Evidence

- `pnpm exec tsc --project .scratch/command-dock/review-probes/tsconfig.json --noEmit`: exits 0 while accepting the deliberately mismatched item.
- `pnpm exec playwright test --config .scratch/command-dock/review-probes/playwright.config.ts`: two deliberately failing regression probes for the confirmed grip and overflow defects. The overflow probe also ran separately after adding an animation-settling barrier.
- Review probes are outside the production test suites and perform no source edits.

No confirmed React state-lifecycle defect is added. The rename slot's behavior across temporary availability loss remains an unverified hypothesis; the documented gesture ref/state split has a legitimate event-versus-render purpose. Explicitly deferred Space rename and other follow-up tickets are not reported as new regressions.

## Earlier Card hover fix

The Card fix changes pointer-focus reveal to keyboard-visible-focus reveal for rail actions and resize controls. Its isolated regression passed, followed by `pnpm verify` (194 test files, 2,343 tests passed and two skipped), `pnpm e2e` (174 passed), and `pnpm e2e:ladle card` (40 passed).

## Answer

All four findings were confirmed and fixed on `feat/07-promote-the-dock`. The
evidence for each is the failure it produced before the fix.

**The grip accepted a secondary-button drag — fixed.** `onPointerDown` now
refuses `button !== 0`, a non-primary pointer, and a press arriving while a
gesture is already in flight; the initiating `pointerId` is retained and one
`holds(event)` predicate gates move, up and cancel. Pointer *capture* routes the
captured pointer's events to the element but routes nothing away, so a second
pointer still reaches every handler — the in-flight check is what stops it
stranding the first one's capture. Red first in both places: the browser
reproduced the reported slot change, and jsdom covered the multi-pointer half a
browser cannot drive. jsdom ships no `PointerEvent`, so Testing Library was
falling back to `MouseEvent` and dropping `pointerId`/`isPrimary`; a polyfill
sits beside the existing environment stubs.
Tests: `packages/app/e2e/dock-interactions.spec.ts`,
`packages/app/test/dock-commands.test.tsx`.

**A short vertical Dock overflowed instead of scrolling — fixed.** The cap was
on the frame and `overflow-y: auto` on its unconstrained child, so the child
kept its content height and had no scrollable viewport. `.command-dock` is a
flex column now and the surface takes `min-height: 0`, which hands the strip the
frame's capped box. Width had only ever worked by accident: a block child fills
its parent's content width unasked, and height never does. Red first at the
reported 844x220, where the surface ended 9px past the screen.
Test: `packages/app/e2e/mobile-dock.spec.ts`.

**Dock CSS still overrode shared Button appearance — fixed.** Both treatments
are variants now: an `aria-expanded` state on the shared quiet recipe, which
keeps the "a control added later is covered without being told" property, and a
`receded` variant for the parent crumb. Worth recording that both old rules won
only by load order — `.command-dock__crumb` at specificity (0,1,0) merely *tied*
Tailwind's `text-muted-foreground`. No behaviour to regress, so no test; the
computed values were probed in a browser and match.
**One accepted consequence:** the open state now reaches every `ghost`
disclosure trigger, so `SelectedEdgeControls`' "Edit this Edge" trigger fills
while its editor is open. Judged correct rather than a regression, and recorded
here because it is a visual change outside this surface.

**The generic menu did not enforce the type its callback promised — fixed.**
The primitive cannot fix it, and that was established by measurement rather than
assumed: typing the children slot as
`ReactElement<DropdownMenuRadioItemProps<Value>>` still accepts a mismatched
item, because every JSX expression is `ReactElement<any, any>` and the `any`
defeats the check. A typed options API was rejected on the same evidence — three
of the five Dock groups render icons, indent markup or interleaved labels, so an
array API could not express them and would be an export its own motivating
consumers could not adopt. So the group's doc comment now states what the
generic buys and what it does not, the three Dock groups dealing in branded ids
bind their item type as `CardsDrawer` already did, and
`tools/typing-fixtures/must-fail/mismatched-menu-item.tsx` holds the rule
permanently. The colour and slot groups are deliberately left unbound, with the
reason written down so nobody "fixes" them. Red first: `value="none"` compiled
clean before the binding and fails `TS2322` after.

Adding that fixture also found a latent hole in the gate itself:
`typing-fixtures.test.ts`'s `TSC_DIAGNOSTIC` matched `\.ts`, and the next
character of a `.tsx` fixture is `x` rather than the `(` the pattern needed — so
any `.tsx` fixture would have been read as *unrejected*. It was the first one.

## What the review did not find

Two suites went red on rebasing onto `main`, and neither is visible from this
report's scope. The Ladle spec asserted persistence sentences that PR #177 had
moved into `authoring-refusal.ts`, and `a side-edge Dock keeps names` was flaky
against a contended runner. Both are fixed on the branch; the second is recorded
here because the first diagnosis of it — a file changing mid-run — was wrong,
and a clean CI checkout is what disproved it.
