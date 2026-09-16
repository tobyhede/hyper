# 13: An opened Thing is drawn in chrome tokens

**What to build:** Every rule that draws a Thing reads the Thing's tokens, not the chrome's.

Found by running ticket 09's experiment. A block that named only chrome tokens changed a Thing, which is the opposite of what ticket 06 and ADR 0064 say: the Thing is paper on the canvas, the chrome floats above it, and the two scales are separate.

`packages/app/src/styles.css` held six rules drawing Thing surfaces out of the chrome's vocabulary. The closed Thing's face was never affected — `packages/ui/src/canvas-thing.css` has always read `--canvas-thing-*` throughout. What was wrong is everything the app's own stylesheet draws around and inside it.

Measured in the running application, presenting a Thing so `.thing--full` mounts:

```
before   presented Thing: bg=#fbfbfa  border=1px #dedede  radius=10px
after    presented Thing: bg=#f4efe4  border=4px #0b0d11  radius=0px
         closed Thing:    bg=#f4efe4  border=4px #0b0d11  radius=0px   (unchanged by this ticket)
```

So an opened or presented Thing used to be a chrome panel wearing a Thing's position. Opening a Thing changed its material. That is now fixed, and the opened Thing is the closed Thing's box exactly.

## What changed

| rule | was | now |
| --- | --- | --- |
| `.rf-thing-node` | `--radius-chrome-xl` | `--canvas-thing-radius` |
| `.thing` | `--card`, 1px `--border`, `--radius-chrome-xl` | `--canvas-thing-face-rest`, `--canvas-thing-border-width` `--canvas-thing-ink-color`, `--canvas-thing-radius` |
| `.rf-thing-node--active :is(.thing, .canvas-thing)` | `border-color: --accent`, `outline: --primary` | border not restated; `outline: --canvas-thing-ink-color` |
| `.rf-thing-node__content .thing--full` | `--card`, 1px `--border`, `--radius-chrome-xl` | as `.thing` |
| `.rf-thing-node__content .thing__body pre` | `--radius-chrome-sm`, `--secondary` | `--canvas-thing-radius`, `color-mix(in srgb, currentcolor 8%, transparent)` |

Two of those deserve naming.

**The presented Thing was losing its border.** `border-color: var(--accent)` drew `#f0f0ef` — a near-white — over the Thing's 4px ink edge, for exactly as long as it was the Thing being presented. That is a leftover from the dark theme, where `--accent` was not a near-white. The declaration is removed rather than translated: the Thing's border is already its ink, and restating it would be one more place to keep in step.

**The code block takes a tint of its own ink.** `--secondary` is a chrome grey and reads as a patch of chrome on cream paper. `packages/ui/src/markdown-thing-body.css` already solved this for the other body renderer with `color-mix(in srgb, currentcolor 8%, transparent)`, which works on both Thing faces because it is derived from the text on them. The same value is used here so the two renderers agree.

`.canvas-refusal` keeps its chrome tokens and is correct: it is a chrome notice that floats over the canvas, not a Thing.

**Status:** resolved

- [x] No rule drawing a Thing reads a chrome token
- [x] An opened or presented Thing draws the same box as a closed one, measured rather than eyeballed
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
