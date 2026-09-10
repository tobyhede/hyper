# Adversarial Dock review — 2026-09-10

Status: open

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
