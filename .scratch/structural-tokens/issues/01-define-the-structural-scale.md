# 01: Define the structural scale and emit it as theme tokens

**What to build:** A named vocabulary for the geometry the chrome is drawn in — radius, border width, font weight, shadow, and the shadow's offset — so that a structural value has one place it is stated and every control follows from it. Today each control states its own, and the vocabulary a control would consume does not exist to be consumed.

Two findings from the inventory shape this ticket, and neither is mechanical.

`--radius-md: 0.5rem` is declared in `:root` and is **not** wired into `@theme inline`.

**This ticket originally said that `rounded-md` therefore does not resolve to it. That was wrong, and the correction is recorded here because the ticket caused a wrong change before the test caught it.** The application builds `rounded-md` as `border-radius: var(--radius-md)` either way. Tailwind declares its own `--radius-md: 0.375rem` inside `@layer theme`. The application declares `0.5rem` in an unlayered `:root`. An unlayered declaration has a higher priority than a layered one, so the utility already gives 8px. No repair is needed and none is made.

A fix was written for the stated problem, then removed. It added `--radius-md: var(--radius-md);` to `@theme inline`. Two builds, one with the line and one without, produced the same utility text and the same 8px result. The line's only effect was to replace Tailwind's `0.375rem` default with a self-referential declaration, which also removes a working fallback. `docs/agents/workflow.md` says that a negative result belongs in a ticket and not in the source, which is why it is here.

The values in the tree do not collapse cleanly, so reconciling them is a **decision with a visible delta** rather than a substitution:

```
radius in use:      2px, 3px, 4px, 5px (calc), 6px (calc)
chrome surfaces:    10px
type in use:        0.8rem, 0.85rem (13.6px), 13px, 10px
```

`0.85rem` and `13px` are 0.6px apart — near-duplicates, not duplicates. Every collapse this ticket makes is a real if small visual change, and the ticket records which values merged and by how much they moved. Where a value should not merge, it stays its own token rather than being forced onto the scale.

Scope is the chrome's scale. The Thing's own geometry is deliberately a second scale and belongs to ticket 06.

Nothing consumes the tokens in this ticket and the rendered product does not change, except where a recorded reconciliation moves a value.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Every current structural value in the chrome is inventoried with its count and the surface that states it
- [x] The scale is chosen and each collapsed near-duplicate is recorded with its pixel delta
- [x] Tokens are declared in `:root` and wired into `@theme inline`, so the corresponding Tailwind utilities resolve
- [x] `--radius-md` resolves through its utility (it already did; see the correction above), and no new token is declared that a utility cannot reach
- [x] A value that should keep its own identity is a named token rather than a step on the scale, with the reason recorded
- [x] `pnpm verify` passes and the output is reported

## Inventory (chrome scope; Thing scope excluded per ticket 06)

**Radius**, `packages/ui/src/*.tsx` (arbitrary Tailwind values):

| Value | Count | Sites |
| --- | --- | --- |
| `rounded-[6px]` | ×9 | `Popover.tsx`, `PaletteColorPicker.tsx` (×2), `Command.tsx` (×2), `Button.tsx`, `Select.tsx` (×2), `toggle-group.tsx` |
| `rounded-[4px]` | ×3 | `PaletteColorPicker.tsx`, `Command.tsx`, `Select.tsx` |
| `rounded-[calc(var(--radius-md)-3px)]` (=5px) | ×2 | `input-group.tsx` (`xs`, `icon-xs`) |
| `rounded-[calc(var(--radius-md)-5px)]` (=3px) | ×1 | `input-group.tsx` (kbd slot) |
| `rounded-[2px]` | ×1 | `components/tooltip.tsx` (arrow) |

Plus one instance outside `packages/ui/src` on the same 6px step: `packages/app/src/components/SelectedEdgeControls.tsx`.

**Radius**, hand-rolled chrome CSS (literal `border-radius`):

| Value | Site |
| --- | --- |
| `10px` | `packages/ui/src/command-surface.css` (the shared command-surface panel — Command Dock and Thing rail both mount it) |
| `4px` | `packages/app/src/components/command-dock.css` (dock buttons) |
| `3px` | `packages/app/src/components/command-dock.css` (dock grip) |
| `6px` | `packages/app/src/components/things-popover.css` |
| `0` | `packages/ui/src/thing-rail.css` (deliberate — the rail is seated flush in its Thing, not a step on the scale) |

**Border width**, chrome scope: `border` (Tailwind's default, 1px) is the baseline nearly everywhere (`command-surface.css`, `Button`'s base recipe, `Popover`, `Select`, `Command`, `things-popover.css`). The one non-default value is `border-[3px]` on `Button`'s `commit` variant (×1), which sets all four sides to 3px so only the bottom edge (`border-b-primary`) reads as an accent bar without the border-box height jumping between variants.

**Type size**, `packages/ui/src/*.tsx` (arbitrary Tailwind values):

| Value | Pixels | Count | Sites |
| --- | --- | --- | --- |
| `text-[0.85rem]` | 13.6px | ×5 | `Command.tsx` (×2), `Button.tsx` (base), `Select.tsx` (×2) |
| `text-[13px]` | 13px | ×4 | `PaletteColorPicker.tsx`, `Button.tsx` (`compact`), `toggle-group.tsx`, `components/breadcrumb.tsx` |
| `text-[0.8rem]` | 12.8px | ×1 | `Command.tsx` (empty/description text) |
| `text-[10px]` | 10px | ×1 | `Command.tsx` (uppercase group heading) |

**Shadow**: `command-surface.css` states a two-layer "contact + cast" shadow washed in `color-mix(in oklab, var(--foreground) N%, transparent)`. The same shadow, hand-copied with a hardcoded `rgb(31 41 51 / N%)` instead of the token, also appears on `packages/app/src/styles.css`'s `.shell__notice` and `.canvas-refusal` (both React-Flow-adjacent, hand-rolled, out of this ticket's scope). `command-dock.css` has its own, larger single-layer elevation for the whole floating Dock (`0 14px 34px … 20%`) — a different, more prominent lift, not merged with the panel shadow.

**Font weight**: no chrome control states a raw/arbitrary font-weight anywhere in the tree. Every chrome use of weight (`InlineTitleEditor.tsx`, `alert-dialog.tsx`, `input-group.tsx`, `card.tsx`, `label.tsx`, `field.tsx`, `combobox.tsx`, `breadcrumb.tsx`, `alert.tsx`, `kbd.tsx`, `context-menu.tsx`, `dropdown-menu.tsx`, `input.tsx`) already goes through Tailwind's own semantic scale (`font-medium`, `font-normal`, `font-semibold`), which is already a named vocabulary and not a magic number to reconcile. The only literal numeric `font-weight` declarations in the whole tree are in `markdown-thing-body.css`, `thing-search-combobox.css` and `canvas-thing.css` — all Thing scope, ticket 06. **This ticket therefore adds no font-weight token**: there is nothing in chrome scope to name. (Worth flagging: the opening paragraph above lists "font weight" among the five properties, but the concrete inventory that follows it only ever evidences radius and *type size* — the real second axis this ticket reconciles is type size, not weight. Recorded here rather than silently reinterpreted.)

**Shadow offset**: not a separate token. A shadow's offset is part of its one composite value (as Tailwind's own `--shadow-sm`/`--shadow-md`/etc. are), so `--shadow-chrome-elevated` below carries its offsets as part of the one token rather than decomposed into separate x/y/blur primitives.

## Reconciliation decisions

**Radius — no merges.** `2px`, `3px`, `4px`, `6px` and `10px` are each used in a genuinely distinct, non-overlapping context (a decorative tooltip marker; a mechanical drag grip; a compact control/menu-item corner; the dominant control corner; a surface panel corner). None is a near-duplicate of a neighbour the way the type sizes are — each is already a deliberate, separated step — so every one keeps its own token on an ascending scale:

- `--radius-chrome-2xs: 2px` (unmerged, singleton — tooltip arrow; not consumed in this ticket or ticket 02)
- `--radius-chrome-xs: 3px` (unmerged, singleton — the Command Dock's grip; not consumed here)
- `--radius-chrome-sm: 4px` (the ×3 `rounded-[4px]` sites, plus the Dock's own buttons; not consumed by ticket 02)
- `--radius-chrome-md: 6px` (the ×9 `rounded-[6px]` sites, including `Button`; **consumed by ticket 02**)
- `--radius-chrome-lg: 10px` (the shared command-surface panel; **consumed by ticket 02**)

No pixel deltas: every one of these is a same-value renaming, not a collapse.

**Excluded from the scale, not merged and not forgotten**: `input-group.tsx`'s two `calc(var(--radius-md) ± Npx)` values (5px, 3px) are a nested-corner relationship to `--radius-md` (an inner control's corner drawn a fixed offset smaller than its container's, the standard concentric-radius technique), not an independently authored pick. They stay expressed relative to `--radius-md`, which already resolves correctly, rather than being pulled onto the `--radius-chrome-*` ladder.

**Border width.** `--border-width-chrome-accent: 3px` names `Button`'s `commit` accent. Tailwind v4 has no themable border-width namespace (confirmed against its shipped `theme.css`: no `--border-width-*` keys exist, only the fixed `border`/`border-2`/`border-4`/`border-8` utilities), so a plain `--radius-*`-style token would not produce a matching utility. `border-chrome-accent` is declared instead as a Tailwind v4 `@utility`, verified to compile to `.border-chrome-accent { border-width: var(--border-width-chrome-accent) }`.

**Type size — one merge, recorded.** `0.85rem` (13.6px, ×5) and `13px` (×4) are 0.6px apart — near-duplicates, not duplicates, exactly as flagged. They collapse into one token, `--text-chrome-sm: 0.85rem`. `0.85rem` was chosen as the canonical value over `13px` because it has the larger existing count (5 vs 4) and because a `rem` unit tracks the reader's font-size preference, which a hardcoded `13px` does not. **Delta: the four `13px` sites move to 13.6px, +0.6px.** One of those four sites is `Button`'s own `compact` size (ticket 02) — its font size moves from 13px to 13.6px, a change too small to be visible at arm's length but real and now recorded rather than silently absorbed. `0.8rem` (12.8px, ×1) and `10px` (×1) are each their own step — `--text-chrome-xs: 0.8rem` and `--text-chrome-2xs: 10px` — neither close enough to the 13-ish cluster or to each other to read as a duplicate, so neither is forced onto it and neither unit is converted (no reason to touch a value that isn't merging).

**Shadow.** `--shadow-chrome-elevated` names the two-layer contact-plus-cast shadow already stated in `command-surface.css`, copied verbatim (no value change). It is declared as a plain `:root` custom property rather than wired into the `@theme`/`@theme inline` `--shadow-*` namespace: nothing in this ticket or ticket 02 applies a `shadow-*` utility class (`command-surface.css` reads the custom property directly in its own `box-shadow`), and the only thing routing it through the theme namespace would add is Tailwind's `--tw-shadow-color` override hook for a `shadow-<color>` modifier — unneeded machinery for a value nothing recolours. Verified against the compiled CSS: both placements (plain `:root` and `@theme inline`) produce the identical `color-mix()` value and the identical `@supports`-gated fallback for a browser without `color-mix()` support — that fallback is Lightning CSS's general handling of `color-mix()` (already true of `Button`'s existing `receded` variant, which uses `color-mix()` directly) and not something either placement of this token changes.

## Verification method

Tailwind v4 only emits a theme-driven utility class for a name it finds referenced by a scanned source file. Since nothing consumes these tokens yet (by design — see "Nothing consumes the tokens in this ticket" above), the ordinary app build would not exercise the new class names at all, which would leave "verify it resolves" an assumption rather than a check. Each new utility (`rounded-chrome-2xs/xs/sm/md/lg`, `text-chrome-2xs/xs/sm`, `border-chrome-accent`) was verified by temporarily forcing generation with a `@source inline("…")` probe line, running a real `vite build`, and reading the compiled CSS — then, for `rounded-md` and the two placements of the shadow token, additionally loading the compiled CSS in a real Chromium instance (Playwright) and reading `getComputedStyle` to confirm the browser-resolved value rather than just the generated rule text. The probe line was removed afterward; it is not part of the shipped diff. Findings:

- `.rounded-md { border-radius: var(--radius-md) }` compiles identically with and without a `@theme inline` entry, and resolves to `8px` (0.5rem) in both builds. The unlayered `:root` declaration outranks Tailwind's `@layer theme` default. This is the finding that corrects the ticket's opening premise.
- `.rounded-chrome-2xs/xs/sm/md/lg`, `.text-chrome-2xs/xs/sm` and `.border-chrome-accent` each compile to exactly their declared value.
- `--shadow-chrome-elevated` resolves to the identical `color-mix()` expression whether declared in `@theme inline` or plain `:root`.

## `pnpm verify`

Reported in the PR/report accompanying this commit.

## Inventory completion (follow-up)

**This ticket's first inventory was incomplete.** It scanned `packages/ui/src` and two stylesheets in `packages/app`. It did not scan `packages/app/src/components/*.tsx` or `packages/react-flow-adapter/src/*.tsx`. Ticket 05 would have found the gap and had to extend the scale itself, which would have made it a writer of the token file rather than a consumer of it — and tickets 03, 06 and 07 would have written the same file at the same time.

A complete scan across every package, for the four axes in scope:

```
radius   6px ×9   4px ×3   2px ×2   8px ×1   + 2 calc (excluded, see above)
type     13px ×4  0.85rem ×4  10px ×2  0.75rem ×2  12px ×1  0.8rem ×1
shadow   0 12px 40px rgba(0,0,0,0.5) ×2
         0 6px 20px rgb(0 0 0/45%)   ×1
         0 0 1px rgba(0,0,0,0.85)    ×1
border   none beyond the 3px already tokenised
```

Two changes to the scale follow, both made before tickets 03 to 07 start so that none of them has to write this file:

**A sixth radius step, and a rename.** `8px` (the Graph HUD's panel) fits between `md` and `lg`. Inserting it in order means `lg` becomes `8px` and the existing `10px` becomes `xl`. The alternative — a name out of sequence, or forcing 8px onto 6px or 10px at a 2px delta — trades an ordered scale for a list. **Delta: none.** The 10px surface keeps its value under a new name; one consumer (`command-surface.css`) follows the rename.

**`--text-chrome-xs` becomes `0.75rem` (12px), from `0.8rem` (12.8px).** `0.75rem` and `12px` are the same size and appear at 3 sites between them; `0.8rem` appears at 1. This ticket's own tiebreak — larger count wins, `rem` spelling wins — chooses 12px. **Delta: one site (`Command.tsx`, empty and description text) shrinks 0.8px.** Nothing consumed `--text-chrome-xs` yet, so the token value changes freely.

**No additional shadow token is added, deliberately.** `--shadow-chrome-elevated` already names the command-surface elevation earlier in this ticket. The scan above counted four matches across three distinct values: two are comment-only `0 12px 40px …` text describing a value that was already replaced (the scan did not exclude comments), one is the live elevation on `SelectedEdgeControls` (`shadow-[0_6px_20px_rgb(0_0_0/45%)]`), and one is a 1px `drop-shadow` glyph outline, which is a legibility technique and not an elevation. See `.scratch/structural-tokens/issues/10-a-dark-theme-shadow-survives-on-one-surface.md`. Minting a token for that remaining live black-based shadow would make it permanent by naming it, so it stays until that ticket decides what replaces it.
