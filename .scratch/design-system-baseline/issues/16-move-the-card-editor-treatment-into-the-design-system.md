# 16 — Move the Card editor's treatment into the design system

**What to build:** Take the opened-Card editor's flat-paper appearance out of
`packages/app/src/styles.css` and put it where the design system keeps hand-rolled
component CSS — beside the component that draws it, as `canvas-card.css` sits
beside `CanvasCard`.

**Blocked by:** None.

**Status:** resolved — shape (1), colocation. The Card-choice popup's theme went to
`packages/ui` beside its own component instead, for the reason recorded below.

- [x] No `card-editor` block remains in `packages/app/src/styles.css`, and its
      `handRolledStyles` entry is dropped from
      `packages/app/stories/design-system-inventory.ts`.
- [x] `[data-card-search-combobox]` leaves `styles.css`, entry and all — but not
      with the editor. The premise here and in the inventory, that it themes
      "the popup Base UI portals out of *this pane*", is false: the rules are
      unscoped and reach every consumer. It went beside `CardSearchCombobox`
      instead. See the comment below.
- [x] The treatment lives with its component and travels with it, so a consumer
      that renders the editor gets its appearance without importing an app
      stylesheet.
- [x] Hard-coded colours become tokens on the same footing as
      `--canvas-card-*-color`, or are justified in place if a token would be
      wrong.
- [x] `Components/Card and Alias Panes` still renders the same editor, and its
      existing parity claims still hold in both suites.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green.

## Why this exists

Issue 08 made `packages/app/src/styles.css` a recorded list: every block in it —
keyed by class, or, where a rule names no class, by its leading attribute, id or element —
carries the React Flow or integration requirement that keeps it out of
`@project/ui`. Fourteen of the seventeen entries earn that — counted 2026-08-21,
after the element-name fallback added `*` and `body`. `card-editor` does not —
it is roughly 200 lines of product appearance, hard-coded ink (`#0b0d11`), paper
(`#fffaf0`) and rule colours, a type scale and a footer treatment. Nothing about
it is React Flow's. Two more fall short with it: `[data-card-search-combobox]`
themes the popup this editor portals out of the pane and travels with it, and
`workspace-selection` is condemned with its component under `space-cards/04`.

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

## Comments

### 2026-08-22 — colocated, and one premise of the ticket was wrong

**Shape (1) was taken**, as recommended. `packages/app/src/components/card-editor.css`
sits beside `OpenCard`, which imports it, the way `canvas-card.css` sits beside
`CanvasCard`. The component did not move: `CardPane` and `OpenCard` compose Space
Authoring refusals, the Alias Target combobox and pane focus, which AGENTS.md keeps
in `app`. The design-system rule this satisfies is "hand-rolled CSS travels with its
component", not "all CSS lives in `@project/ui`" — the same principle that already
puts `GraphHud`'s presentation inside `react-flow-adapter`.

**`[data-card-search-combobox]` went to `packages/ui/src/card-search-combobox.css`
instead, beside `CardSearchCombobox`.** The ticket said it "themes the combobox popup
Base UI portals out of this pane, so it is part of the same treatment", and the
inventory said the same. That is true about where the colours came from and **false
about what they style**: the rules are unscoped and always were, so they reach every
consumer — the opened Card's Alias Target, `NewAlias`, both `SelectedEdgeControls`
endpoints and the keyboard Connect picker in `edge-authoring-react`. Filing them under
the editor would have moved a lie from one file to another. They are the popup's
appearance, so they went to the component that draws it. Nothing was rescoped: the
selector is unchanged, so every consumer draws exactly what it drew before.

**Two `.card-pane` rules travelled with the treatment**, and the ticket's "only
`card-editor` moves" is unchanged in substance. `styles.css` keeps the shared modal
frame — the 16:9 silhouette matching `card.ts` and the scroll boundary that keeps
Cancel and Done reachable — which is what its inventory entry claims. What moved is
`.card-pane[data-variant='card-editor']` and `.card-pane__panel--card-editor`: the
editor's own paper face, ink border and writing size, expressed through the frame's
classes only because that is the element they paint. Leaving them behind would have
left `#fffaf0` and `#0b0d11` in `styles.css` under an entry that says it holds
geometry, which is the outcome this ticket exists to prevent.

**Colours became `--card-editor-*-color` tokens in `tailwind.css`**, beside
`--canvas-card-*-color` and on the same footing: the treatment lives with its
component, the palette stays app-owned. `--card-editor-graph` is deliberately not
among them — it is the Active Graph's own colour, which `OpenCard` supplies inline per
opened Card. The popup's palette stayed in place rather than becoming a second token
family: that rule set already declares its own `--foreground`, `--popover`, `--accent`
and `--muted-foreground`, which is the shadcn theming seam `components/combobox.tsx`
reads, so it is already the one place the palette is stated. Two literals that had
escaped it (`#ded6c7`, `#887f70`) became `--csc-divider` and `--csc-refused-foreground`
— **deliberately private names, not shadcn ones.** The first attempt called the divider
`--border`, which review caught: `@theme inline` maps `--border` to `--color-border`,
so redeclaring it on the popup would have reached the whole portalled subtree and
handed cream to `ComboboxSeparator`, `Button`'s secondary and ghost variants and
`DropdownMenu` the moment any of them rendered inside it, with nothing to catch it.

**A cascade risk was found and pinned rather than reasoned away.** The moved rules
override `.card-pane__panel` at equal specificity, so only source order separates
them — the same trap that made a presented Card's title stop scaling under Issue 08.
The order holds because the module graph reaches the component's stylesheet after
`main.tsx` loads `styles.css`, and the Ladle catalogue reaches it after
`.ladle/components.tsx` does. But that is now a fact about the module graph rather
than about line numbers in one file, and **nothing in either suite asserted the paper
appearance at all** — every existing test passes against the generic dark pane. Two
computed-style assertions were added, one per bundle:
`editing.spec.ts` → "the opened Card draws the flat paper treatment on its own
surface", and `ladle-e2e/issue-03-card-and-alias-panes.spec.ts` → "the Markdown story
draws the flat paper treatment in the catalogue bundle". A third, "the Card-choice
popup draws its paper theme from the component that owns it", was added on review:
the popup's sheet carries exactly the same exposure — it survives only on a
side-effect import — and had been left without the pin the editor's got. All three are
untagged: they guard the stylesheets and are not parity claims. The catalogue one earns its place independently —
`.ladle/components.tsx` loads `styles.css` **before** `tailwind.css`, the reverse of
`main.tsx`, so the two bundles are not the same cascade, and a divergence between them
is exactly what looked correct in one surface and wrong in the other the last time
this treatment was rewritten.

**Verification.** `pnpm verify` green — 151 files, 1658 passed, 8 skipped.
`pnpm e2e` 116 passed. `pnpm e2e:ladle` 39 passed. `pnpm ui:catalog:check` valid with
both entries gone; it failed on eleven `card-editor` rules and the combobox rule when
the entries were dropped first, which is the ratchet working in the direction the
ticket relies on.

**Two things review found that were left as they are, on purpose.**

*The moved sheets are not self-contained,* and the third acceptance line above should be
read the way `canvas-card.css` reads: the CSS travels with its component, the palette
stays app-owned in `tailwind.css`. A surface that loaded `card-editor.css` without
`tailwind.css` would not degrade to the generic pane — `border: 4px solid var(--…)` with
an undefined custom property is invalid at computed-value time, so the shorthand unsets
and the panel draws as a transparent unbordered box. Per-declaration fallbacks would fix
that and would also put every colour in two places, which is the duplication the tokens
exist to remove. Every consumer of `OpenCard` is in `app` and has `tailwind.css`.

*The popup's refusal text is under AA.* `--muted-foreground: #9aa3b3` on the cream
`--popover: #fffaf0` is about 2.4:1 at 12px, and `--card-editor-cancel-color` is about
4.4:1 at 13px. Both values predate this ticket, and both are the defect `tailwind.css`
already records for the canvas Card and fixed there with `--canvas-card-muted-color`
plus `canvas-card-contrast.test.ts`. The new `--card-editor-*` family was created "on
the same footing" without that test. Changing what these surfaces look like is a design
decision rather than part of moving a stylesheet, so it is written down here and in the
stylesheet's own comment rather than done quietly. It wants a ticket.

**What this does not close.** Issue 08's "removed or explicitly limited" line still has
`workspace-selection` outstanding, which is condemned with its component under ADR 0058
and belongs to `space-cards/04`.
