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

**Status:** ready-for-agent

- [ ] `SelectedEdgeControls`'s raised surface draws an elevation the light theme states, and the choice is recorded
- [ ] No surface in the repository draws an elevation shadow whose colour is written as black or `rgba(0,0,0,…)` — a contrast outline on a glyph is not an elevation and is out of scope
- [ ] `things-popover.css`'s hairline shadow takes its colour from the theme
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
