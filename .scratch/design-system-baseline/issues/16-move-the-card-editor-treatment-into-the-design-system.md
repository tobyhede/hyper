# 16 — Move the Card editor's treatment into the design system

**What to build:** Take the opened-Card editor's flat-paper appearance out of
`packages/app/src/styles.css` and put it where the design system keeps hand-rolled
component CSS — beside the component that draws it, as `canvas-card.css` sits
beside `CanvasCard`.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] No `card-editor` block remains in `packages/app/src/styles.css`, and its
      `handRolledStyles` entry is dropped from
      `packages/app/stories/design-system-inventory.ts`.
- [ ] The treatment lives with its component and travels with it, so a consumer
      that renders the editor gets its appearance without importing an app
      stylesheet.
- [ ] Hard-coded colours become tokens on the same footing as
      `--canvas-card-*-color`, or are justified in place if a token would be
      wrong.
- [ ] `Components/Card and Alias Panes` still renders the same editor, and its
      existing parity claims still hold in both suites.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green.

## Why this exists

Issue 08 made `packages/app/src/styles.css` a recorded list: every class block in
it carries the React Flow or integration requirement that keeps it out of
`@project/ui`. Twelve of the thirteen entries earn that. `card-editor` does not —
it is roughly 200 lines of product appearance, hard-coded ink (`#0b0d11`), paper
(`#fffaf0`) and rule colours, a type scale and a footer treatment. Nothing about
it is React Flow's.

That is why Issue 08's second acceptance line — "legacy feature-owned visual
styling is **removed or explicitly limited** to React Flow geometry and
integration requirements" — is left unticked. Recording a reason is a third
option the criterion does not offer, and the inventory's own doc comment says
product appearance belongs in `@project/ui`. This ticket is the difference
between debt with an owner and debt with an excuse.

## The awkward part, stated up front

`canvas-card.css` works because `CanvasCard` lives in `@project/ui` and imports
it. The Card editor does not: `CardPane` and `OpenCard` are in
`packages/app/src/components`, because the editor composes application concerns —
Space Authoring refusals, the Alias Target combobox, pane focus.

So the move is not a file copy, and there are at least two honest shapes:

1. **Colocate without moving the component.** The stylesheet sits beside
   `OpenCard`/`CardPane` in `packages/app/src/components` and is imported by the
   module that draws it, exactly as `CanvasCard` imports its own. The design-system
   rule this satisfies is "hand-rolled CSS travels with its component", not "all
   CSS lives in `@project/ui`" — and `GraphHud` already owns its presentation
   inside `react-flow-adapter` on the same principle (`docs/agents/ui.md`).
2. **Extract the paper surface into `@project/ui`.** The flat-paper frame, rail,
   title field, body and footer become a presentation-only component the app
   composes with its own state. More faithful to the criterion's wording, and a
   bigger change.

Take (1) unless grilling says otherwise: it is the smaller change, it removes the
inventory entry, and it puts the CSS where the repo already says hand-rolled CSS
goes. Whichever is taken, decide it before writing code, and record the reason —
the choice is the substance of this ticket, not the file move.

**Do not simply delete the treatment.** ADR 0051 settled the opened Card as a
flat paper object at a larger writing scale; this is that decision's appearance,
and it is `packages/app/e2e/editing.spec.ts`'s subject throughout.

**One neighbouring rule stays put.** `card-pane` is the modal frame's geometry
against the canvas — the 16:9 silhouette matching `card.ts` and the scroll
boundary that keeps Cancel and Done reachable — and it is recorded as integration
styling on purpose. Only `card-editor` moves.

## Verifying it

`pnpm ui:catalog:check` fails until the `handRolledStyles` entry is dropped once
the rules are gone, so the ticket cannot be half-landed. `pnpm e2e:ladle` proves
the story still renders the same editor, and `pnpm e2e` proves the application
does — the same dual proof ADR 0052 asks of every claim.
