# 10: A dark-theme shadow survives on one surface

**What to build:** `SelectedEdgeControls`'s raised surface stops drawing a shadow made of 45% black, and draws the light theme's own elevation instead.

```
packages/app/src/components/SelectedEdgeControls.tsx:38
  shadow-[0_6px_20px_rgb(0_0_0/45%)]
```

A shadow written in black at that opacity is a value chosen against a dark canvas. The theme has been light since `a5a76669`. On sand it reads as a grey cloud rather than as a lift.

The theme already states its one elevation as `--shadow-chrome-elevated`, which ticket 14 made the hard unblurred `6px 6px 0 var(--foreground)` offset the command surface now draws. Whether this surface wants that, Tailwind's `shadow-lg` — which is what `Popover` and `Select` both chose for the same problem — or a second named elevation is the decision this ticket takes. It is a decision about what the product looks like, so it wants an eye on it rather than a substitution.

**This ticket is smaller than it first claimed, and the correction is worth reading.** It originally said four surfaces were affected, and named `Command.tsx` among them, on the strength of a grep for the literal value. Three of those four were wrong:

- `Popover.tsx` and `Select.tsx` draw `shadow-lg` and have done since the theme flipped. The literal appears in each file only inside a comment explaining what the current value replaced. A grep that does not exclude comments reads a description of a fixed defect as the defect.
- `PaletteColorPicker.tsx` draws `drop-shadow-[0_0_1px_rgba(0,0,0,0.85)]` on a check glyph sitting over an arbitrary swatch colour. A 1px black outline is how a glyph stays legible against a colour the author picked, not an elevation sized for a dark theme. It stays. (`.scratch/structural-tokens/issues/07-...` may delete the component regardless.)

So the sweep in `a5a76669` was very nearly complete, and the commit message that claims it is accurate. One surface was missed.

## A second, smaller one found by ticket 06

`packages/app/src/components/things-popover.css:124` draws `box-shadow: 0 1px 0 rgb(0 0 0 / 4%)`. Ticket 06 found it, correctly left it, and reported it here.

It is the same class of value — a shadow whose colour is written as black rather than taken from the theme — but it is a 1px hairline at 4%, not an elevation sized for a dark canvas. It may simply want `color-mix(in oklab, var(--foreground) 4%, transparent)`, which is what every other hairline in the theme spends. Decide it with the other one.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] `SelectedEdgeControls`'s raised surface draws an elevation the light theme states, and the choice is recorded
- [x] No surface in the repository draws an elevation shadow whose colour is written as black or `rgba(0,0,0,…)` — a contrast outline on a glyph is not an elevation and is out of scope
- [x] `things-popover.css`'s hairline shadow takes its colour from the theme
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## Resolution

- `SelectedEdgeControls`'s raised surface draws `shadow-lg`, the step `Popover` and `Select` spend. It is a floating control over the canvas as they are, so it lifts as they do; the Command Dock's hard offset belongs to the command surface, and reconciling Tailwind's blurred steps with it is the separate decision `tailwind.css` already names. The choice is recorded on `RAISED_SURFACE`.
- `resources-popover.css` (the file this ticket called `things-popover.css` before the rename) draws its toggle hairline as `color-mix(in oklab, var(--foreground) 4%, transparent)`.
- `PaletteColorPicker.tsx`'s `drop-shadow-[0_0_1px_rgba(0,0,0,0.85)]` stays, as this ticket decided: it is a contrast outline on a glyph, not an elevation. Ticket 08's scan records it as a carve-out with that reason.
- Ticket 08's scan holds the second criterion: an elevation shadow written in black fails it.
- **The second criterion was ticked early, and is now held.** Tailwind's own `theme.css` writes every named shadow step (`--shadow-2xs` to `--shadow-2xl`) in `rgb(0 0 0 / …)`, and the theme restated none of them, so `shadow-lg` above, and every `shadow-sm`/`-md`/`-lg` in `Popover`, `Select`, the registry menus, `alert-dialog`, `GraphHud` and `ZoomSlider`, still drew black. The scan read only literals written in source and never resolved a named class to its value. The steps are now restated in `tailwind.css`'s `@theme inline` block with Tailwind's own offsets, blur and opacity in `color-mix(in oklab, var(--foreground) N%, transparent)` — kept blurred rather than moved to the Dock's hard offset, by decision — and the scan fails a named step the theme leaves at black.
- **The named-step check covers every shadow family, by decision.** Tailwind's named `inset-shadow-*`, `text-shadow-*` and `drop-shadow-*` steps are black by default too. None is an elevation, and none is used in `packages/*/src`, but the scan holds them to the same rule: a named step in any of the four families fails unless the theme restates it off black. A glyph's arbitrary `drop-shadow-[…]` contrast outline stays excused, as above.
