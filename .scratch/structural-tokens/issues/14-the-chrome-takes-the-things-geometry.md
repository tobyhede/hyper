# 14: The chrome takes the Thing's geometry

**What to build:** The chrome draws the corner and the shadow the Thing draws.

The decision ticket 09 made answerable, taken by the user after looking at the experiment. The chrome and the Thing are one material: square corners, and an unblurred offset shadow in the chrome's own ink.

**This is one file.** `packages/app/src/tailwind.css` and nothing else — no component, no stylesheet, no test. That is the property tickets 01 to 07 bought, and this ticket is the first spend of it.

```
--radius-chrome-2xs .. --radius-chrome-xl   2,3,4,6,8,10px  ->  0
--radius-sm, -md, -lg, -xl (Tailwind's own)  .25,.5,.5,.75rem -> 0
--radius-md in :root (unlayered)             0.5rem          ->  0
--shadow-chrome-elevated   soft two-layer color-mix wash     ->  6px 6px 0 var(--foreground)
```

**Both radius vocabularies are named, and both are needed.** Ticket 09 measured this: the ten components tickets 02–07 touched read `--radius-chrome-*`, and the registry components they did not touch — `dropdown-menu`, `context-menu`, `combobox`, `card`, `alert`, `alert-dialog`, `kbd`, `textarea`, `input-group`, `field` — read Tailwind's own `--radius-*`. Naming one leaves the menus rounded while the Dock goes square.

`--radius-md` is named twice, in `@theme` and in the unlayered `:root`, because an unlayered declaration beats the `@layer theme` one `@theme` emits. Ticket 01 found that rule; here it is what makes `rounded-md` actually move.

**The six radius names are kept although every step is now zero.** They are what makes this a one-file edit; give them distinct values again and every surface follows. Collapsing them to one token would undo that and is not done here.

## What this ticket does not do

**Tailwind's `shadow-md` and `shadow-lg` are untouched.** A menu, popover and dialog still cast a blurred shadow while the Dock casts a hard one, because those surfaces spend Tailwind's shadow scale rather than `--shadow-chrome-elevated`. It is visible: the menu in the screenshot floats softly over a hard-edged Dock. Reconciling them is a decision of its own, and it is the same two-vocabulary shape this ticket had to handle for radius.

**Ticket 13 lands first and is not optional.** Before it, this change moved an opened Thing too, because the app's stylesheet drew Thing surfaces out of chrome tokens.

**Status:** resolved

- [x] The chrome draws no corner radius and casts the Thing's unblurred shadow
- [x] The change is confined to `packages/app/src/tailwind.css`
- [x] The Thing is unchanged by it
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
