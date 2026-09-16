# 06: Hand-rolled stylesheets consume the tokens, in two scales

**What to build:** The hand-rolled stylesheets state no bare structural literal. Around forty of them sit across the Thing's own stylesheet, the app shell, the Markdown Thing body, the Thing search combobox, the Dock and the Things popover.

**This ticket emits two scales, not one, and that is the decision it carries.** The Thing and the chrome are drawn in deliberately opposite geometry:

```
Thing:   border 4px      radius 0       shadow none at rest
                                        7px 7px 0 (hard, unblurred) dragging
                                        0 0 0 3px selected
Chrome:  border 1px      radius 10px    two-layer soft wash
         (buttons 4px, grip 3px)
```

That is not drift between two versions of one scale. The Thing is paper lying on the canvas and the chrome floats above it, and the geometry is what says so. Collapsing them would erase the distinction.

The repo has already made this call one level up for colour: the Thing's muted and error inks are separate tokens from the chrome's foreground and muted foreground, because the Thing's paper is warmer and does not inherit. Geometry follows the same reasoning. So the Thing gets its own named scale, and the chrome's scale from ticket 01 does not reach across.

**Blocked by:** 02.

**Status:** resolved

- [x] The named stylesheets state no bare structural literal
- [x] The Thing's geometry is its own named scale, distinct from the chrome's
- [x] The opposition between the two — border weight, radius, shadow character — survives the migration unchanged
- [x] A chrome token change does not move the Thing, and a Thing token change does not move the chrome, both demonstrated
- [x] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## The Thing's scale, and where it lives

Four tokens, declared in `tailwind.css`'s `:root`, immediately beside the Thing's colour tokens (`--canvas-thing-ink-color` and its neighbours) rather than beside the chrome's `--radius-chrome-*` family in `@theme inline`. That placement follows the precedent already set for colour: `--canvas-thing-muted-color` and `--canvas-thing-error-color` sit beside `--foreground` and `--muted-foreground` there, separate rather than inherited, with a comment recording why. Geometry gets the same treatment, named the same way (the `--canvas-thing-*` prefix every other Thing fact in that file already carries):

```
--canvas-thing-border-width: 4px;
--canvas-thing-radius: 0;
--canvas-thing-shadow-dragging: 7px 7px 0 var(--canvas-thing-ink-color);
--canvas-thing-shadow-selected: 0 0 0 3px var(--canvas-thing-ink-color);
```

None is wired into `@theme inline`: nothing applies a Tailwind utility class with these names (`canvas-thing.css` and its neighbours are hand-rolled CSS, consumed by `var()`, not by a `className`), so there is no utility for the theme layer to generate — the same reasoning ticket 01 gave for `--shadow-chrome-elevated` staying a plain custom property.

The two shadows are stated as one composite value each, carrying their own colour, rather than decomposed into separate offset/blur primitives — again following `--shadow-chrome-elevated`'s own precedent. `box-shadow: none` at rest is left as the keyword: it says "no shadow," not "a shadow of magnitude zero," and there is nothing for a token to name there any more than there was a reason to tokenise `border: 1px solid var(--border)` on the chrome side.

The stale comment that used to sit above the chrome's `--radius-chrome-*` block — "The Thing's own geometry is a second, deliberately separate scale declared beside `CanvasThing` in `canvas-thing.css`, not here" — was wrong the moment this ticket landed, so it is corrected rather than left to describe a `canvas-thing.css` location the tokens no longer have.

**Everything else stays local, not part of "the scale."** The opposition the ticket names is specifically border weight, radius and shadow character on the Thing's own paper — that is the four tokens above. Font-weight is a fifth axis the ticket also puts in scope (ticket 01 found the only three raw font-weight declarations in the whole tree inside `canvas-thing.css`, `markdown-thing-body.css` and `thing-search-combobox.css`, and assigned all three to this ticket), but it is not part of the stated opposition, and reusing Tailwind's own `--font-weight-semibold`/`-medium`/`-normal` from a hand-rolled sheet would make a Thing's own type depend on whether some unrelated control elsewhere still uses `font-semibold` in its `className` — Tailwind only emits a `--font-weight-*` custom property when a utility using it is scanned from source, so that dependency is real, not hypothetical. Each file therefore names its own font-weight values as file-local custom properties (`--canvas-thing-title-weight` and its two neighbours in `canvas-thing.css`; `--markdown-thing-heading-weight` and its neighbours in `markdown-thing-body.css`; `--csc-item-weight` in `thing-search-combobox.css`), the same way the Title ladder's own ratios and sizes already are. The same is true of a handful of other singleton values that are not the Thing's own paper edge — a resize-mark's border, an authoring handle's border, the Title control's focus-ring radius and its two underline previews, a rendered blockquote's accent bar, a kbd cap's corner — each named once, locally, where it is stated, rather than promoted onto the central scale or left as a bare literal.

## What changed, by file

**`packages/app/src/tailwind.css`**: the four Thing tokens above, plus the corrected comment.

**`packages/ui/src/canvas-thing.css`** (Thing surface): `border: 4px solid …` → `var(--canvas-thing-border-width)`; the main `border-radius: 0` and the title-input's own → `var(--canvas-thing-radius)`; the selected and dragging `box-shadow`s → `var(--canvas-thing-shadow-selected)` / `var(--canvas-thing-shadow-dragging)`. The Title ladder's three font-weights (600/500/400, at four call sites including the title-input) become local `--canvas-thing-title-weight` / `-subtitle-weight` / `-caption-weight`, declared beside the ladder's existing size and ratio tokens. The Title control's own focus-ring radius (2px) and its two hover/editing underline shadows (`inset 0 -2px 0` / `inset 0 -3px 0 var(--canvas-thing-graph)`) become three more local singletons in the same block.

**`packages/ui/src/markdown-thing-body.css`** (Thing surface — content drawn inside an Open Thing): the two `font-weight: 700` sites (headings, `strong`) share one local `--markdown-thing-heading-weight`; the blockquote's `border-left` width (3px) becomes `--markdown-thing-blockquote-border-width`; the shortcut hint's weight (500) and the kbd cap's weight (600) and radius (3px) become three more locals. The edit-target overlay's `border-radius: 0` reuses the central `--canvas-thing-radius`, since it is stated as flush with the Thing's own paper rather than as an independent pick.

**`packages/ui/src/thing-search-combobox.css`** (classified Thing surface, not chrome — see below): its own header comment already calls this "the Thing-choice popup's paper appearance," and its geometry bears that out — flush corners and no shadow, matching the Thing's rest state exactly. Its three `border-radius: 0` sites reuse the central `--canvas-thing-radius`. Its border weight (3px) and item weight (600) become local `--csc-border-width` / `--csc-item-weight`, beside the file's existing private `--csc-*` colours — 3px is this popup's own pick, not the Thing's 4px, and merging them would be an unrecorded reconciliation the ticket does not authorise.

**`packages/app/src/styles.css`** (mixed — classified rule by rule): `.rf-thing-node`, `.thing`, `.rf-thing-node__content .thing--full` and the presenting `<pre>` block are `ThingContent`'s presenting-mode rendering (`.thing`/`.thing--full`, drawn only when `data.showContent`), a different, older front from the interactive `canvas-thing.css` — its stated geometry (a 1px border, a 10px corner) already matches the chrome's own baseline rather than the Thing's opposition, so these consume `--radius-chrome-xl` / `--radius-chrome-sm` rather than joining the Thing's scale. `.canvas-refusal` and `.shell__notice` are chrome (a floating status report, not a Thing), and their shadow was already identified by ticket 01 as "the same shadow [as `--shadow-chrome-elevated`], hand-copied with a hardcoded `rgb(31 41 51 / N%)` instead of the token" and deferred to a later ticket — both now read `var(--shadow-chrome-elevated)`, and `.canvas-refusal`'s 6px corner reads `var(--radius-chrome-md)`. The resize-mark's and the authoring-handle's own border weights (2px, 3px) are drawn in the Thing's own ink but are not the Thing's paper edge, so each gets its own local singleton (`--resize-mark-border-width`, `--authoring-handle-border-width`) rather than reusing `--canvas-thing-border-width`.

**`packages/app/src/components/command-dock.css`** (chrome): the grip's 4px corner → `var(--radius-chrome-sm)`; the snap-hint's 3px corner → `var(--radius-chrome-xs)`.

**`packages/app/src/components/things-popover.css`** (chrome): the row's 6px corner → `var(--radius-chrome-md)`.

**`packages/ui/src/thing-rail.css`**: unchanged. Its one `border-radius: 0` is the deliberate absence ticket 01 already recorded — the rail is seated flush inside its Thing's own border and states no corner of its own to name, rather than echoing the Thing's `radius: 0` as a value. Left exactly as it is.

## Values reported rather than tokenised (the chrome list is complete; these are not on it)

Per the brief, a chrome-scope value not on the given list is reported here rather than answered with a new step:

- `command-dock.css`'s dragging elevation, `0 14px 34px color-mix(in oklab, var(--foreground) 20%, transparent)` — ticket 01 already named this "a different, more prominent lift, not merged with the panel shadow." Left as its own literal.
- `command-dock.css`'s conflict-ring `box-shadow: inset 0 0 0 2px var(--destructive)` on `.command-dock__unwell[data-state='conflicted']` — not on the list. Left.
- `command-dock.css`'s `border-radius: 50%` (the unwell dot) and `styles.css`'s same on the authoring handle — a circle, not a step on a corner-radius ladder (the same category as Tailwind's own `rounded-full`). Left.
- `things-popover.css`'s `border-radius: 999px` (the filter count pill) — the same full-pill idiom. Left.
- `things-popover.css`'s `box-shadow: 0 1px 0 rgb(0 0 0 / 4%)` — black-based, ticket 10's (`.scratch/structural-tokens/issues/10-…`), not touched.
- Every bare `border: 1px solid …`/`border: 0`/`border: none` across all seven files — Tailwind's own universal hairline default or an explicit "no border" reset, neither a value ticket 01's inventory found duplicated or varying, per the precedent it already set for `command-surface.css`'s own `border: 1px solid var(--border)`.

## Reconciliation

Only one, and it was ticket 01's to record, not this ticket's to invent: `.shell__notice` and `.canvas-refusal`'s shadow moves from a hand-copied `rgb(31 41 51 / N%)` alpha blend to `--shadow-chrome-elevated`'s `color-mix(in oklab, var(--foreground) N%, transparent)`. The two are not byte-identical renderings — an oklab mix and a flat alpha blend over the same base colour are not the same arithmetic — but ticket 01 named them "the same shadow" and deferred exactly this substitution to a later ticket. No other rendered value moves; every other change is a same-value renaming.

## Demonstrating the two scales are independent

Following ticket 02's method: a real `vite build` of `packages/app` (not `pnpm dev`), reading the compiled CSS, reverting, and rebuilding clean.

**Chrome token changed, Thing checked:** `--radius-chrome-md` temporarily changed from `6px` to `99px` and rebuilt. The compiled CSS showed `--radius-chrome-md:99px` and `.canvas-refusal`/`.things-popover__row` (both `var(--radius-chrome-md)`) would resolve to it — while `.canvas-thing`'s own `border`/`border-radius` declarations still read `var(--canvas-thing-border-width)`/`var(--canvas-thing-radius)` verbatim, naming no chrome token at all, and `--canvas-thing-border-width`/`--canvas-thing-radius` themselves were unchanged in the output (`4px`/`0`). Reverted; `git diff` showed only the intended tickets diff afterward.

**Thing token changed, chrome checked:** `--canvas-thing-border-width` temporarily changed from `4px` to `77px` and rebuilt. The compiled CSS showed `--canvas-thing-border-width:77px`, while every `--radius-chrome-*` token was unchanged (`2px`/`3px`/`4px`/`6px`/`8px`/`10px`) and `.command-surface`, `.things-popover__row` and `.command-dock__grip` still named only their own `--radius-chrome-*`/`--shadow-chrome-elevated` tokens, unaffected. Reverted clean.

## `pnpm verify` / `pnpm e2e` / `pnpm e2e:ladle`

Reported in the PR/report accompanying this commit. `pnpm verify` passed clean (221 test files, 2708 tests). `pnpm e2e` passed 213/213 on the full run, no flakes despite three other agents running in parallel worktrees at the same time. `pnpm e2e:ladle` passed 103/103.

`packages/ui/test/canvas-thing-title-ladder.test.ts` was updated: its font-weight assertions now check for the `var(--canvas-thing-*-weight)` reference rather than the raw number (with the number itself still pinned through the existing `token()` helper), and the "fits inside the body of a Closed Thing" test — which used to parse the pixel width straight out of `canvas-thing.css`'s own `border` shorthand — now reads `--canvas-thing-border-width` out of `tailwind.css` through a new `themeToken()` helper, since that is where the value now lives.
