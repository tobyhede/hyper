# 12: The Dock's dragging elevation is off the scale

**What to build:** The Command Dock's elevation while it is being dragged is either a named step on the chrome scale or a recorded exception. Today it is neither.

```
packages/app/src/components/command-dock.css:171
  box-shadow: 0 14px 34px color-mix(in oklab, var(--foreground) 20%, transparent);
```

The theme states one elevation, `--shadow-chrome-elevated` — since ticket 14 a hard unblurred `6px 6px 0 var(--foreground)` offset. This is a 34px blur at 20%, and it is deliberately more prominent, because a Dock the author has picked up should read as lifted further than a Dock at rest. Ticket 14 widened the gap: the two no longer differ only in size, they differ in character, so this surface is the one place the chrome still casts a soft shadow of its own making.

Ticket 06 found it. Ticket 01's inventory did not, because that inventory read the four axes it had named and this value is already written in theme terms — it spends `var(--foreground)` through `color-mix`, so it is not a literal and no scan for one reports it. It is off the scale rather than off the theme.

**So the question is not whether it is wrong. It is whether one elevation is enough.** Two answers are reasonable and the ticket picks one:

- The scale gains a second step — a `--shadow-chrome-lifted` beside `--shadow-chrome-elevated` — and the Dock spends it. A future surface that means "picked up" then has a name to reach for.
- The value stays where it is as a surface-specific exception, recorded as such, on the grounds that exactly one surface in the product can be dragged and a scale of two where one has a single consumer is a list.

Either way the decision is written down, which is the part that does not exist now.

**Blocked by:** None (can start immediately). Touches one declaration in one stylesheet.

**Status:** resolved

- [x] The Dock's dragging elevation is a named step or a recorded exception, and the reasoning is written down
- [x] If a second step is added, `things-popover.css`'s and `command-dock.css`'s other elevations are checked against it rather than left behind
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## Resolution

The scale gains a second step. `tailwind.css` states `--shadow-chrome-lifted` beside `--shadow-chrome-elevated`: the same unblurred offset in the same ink, cast further (`calc(var(--shadow-chrome-elevated-offset) + 4px)`, so 10px against the resting 6px). The dragged Dock spends it.

The exception was the other reasonable answer and was not taken because of ticket 14: once the resting elevation became a hard offset, the dragged Dock's soft 34px blur differed in character, not just degree, which made it the one place the chrome cast a shadow of its own making. The Resource already draws its resting and handled states as one character at two distances, so the chrome now does the same. Stating the lifted offset from the elevated one means a theme block that moves the one moves both, which the inert experiment blocks rely on.

Checked against the new step, per the second criterion: `resources-popover.css`'s only other shadow is the toggle's 1px hairline (ticket 10), and `command-dock.css`'s is the `inset 0 0 0 2px var(--destructive)` refusal ring. Neither is an elevation, so neither moves.
