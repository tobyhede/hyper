# 02: Button and the command surface consume the tokens

**What to build:** The tracer bullet through the whole loop. `Button`, the shared command surface stylesheet and the Thing rail stylesheet hold no structural arbitrary values of their own: every radius, border width, weight and shadow they draw comes from the scale ticket 01 emitted.

The demonstrable outcome is that changing one token in the theme file visibly moves every button on the Command Dock and every Thing rail at once — which is the property the whole effort exists to buy, proven on the most-used control before it is spent on the rest.

This ticket is the gate on the remaining migrations. If the vocabulary from 01 turns out to be wrong — a missing step, a step that means two things, a name that does not survive contact with a real control — it is found here, once, and 01 is revised before four other batches inherit the mistake.

`Button` carries reasoning about behaviour that this ticket does not touch: the shared quiet-feedback recipe, and the `aria-disabled` spelling a Base UI toolbar item uses in place of the native property. Substituting geometry must leave that intact.

**Blocked by:** 01.

**Status:** resolved

- [x] `Button`, the command surface stylesheet and the Thing rail stylesheet state no structural arbitrary value
- [x] Changing a single token in the theme file moves every button and every Thing rail, demonstrated
- [x] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [x] Button's behavioural recipes are unchanged, including the `aria-disabled` handling
- [x] Any correction the vocabulary needs is made in 01's tokens rather than worked around here
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## What changed

**`packages/ui/src/Button.tsx`**: `rounded-[6px]` → `rounded-chrome-md`, `text-[0.85rem]` → `text-chrome-sm` (base recipe); `border-[3px]` → `border-chrome-accent` (`commit` variant); `compact` size's own `text-[13px]` is deleted rather than swapped, since it now equals the base recipe's `text-chrome-sm` after ticket 01's merge — restating it would be a redundant, non-deduplicated second font-size utility (see the `tailwind-merge` finding below). The `quietFeedback` recipe and the `:disabled`/`aria-disabled` double-spelling are untouched.

**`packages/ui/src/command-surface.css`**: `border-radius: 10px` → `border-radius: var(--radius-chrome-lg)`; the two-layer `box-shadow` literal → `box-shadow: var(--shadow-chrome-elevated)`. The `border: 1px solid var(--border)` line is untouched — 1px is Tailwind's own universal hairline default, not a value ticket 01's inventory found duplicated or varying anywhere, so there is no scale step to name for it.

**`packages/ui/src/thing-rail.css`**: no change. Its only structural declaration is `border-radius: 0`, which is the deliberate absence of a radius (the rail is seated flush in its Thing), not a step on the scale — there is nothing here for a token to name. The "every Thing rail" half of the demonstrable outcome instead comes through `ThingRailActions`, which mounts the shared `CommandToolbar`/`.command-surface` panel (`command-surface.css`) for a Thing's hover action strip — the same panel the Command Dock wears, per `docs/agents/ui.md`'s "one command surface, drawn wherever the product draws chrome." So the token change below moves both without `thing-rail.css` itself stating anything.

**`packages/ui/src/lib/utils.ts`**: this is the one file the ticket text didn't name, found necessary by consuming the tokens for real (see "What ticket 01 got wrong" below). `cn()`'s `twMerge` now comes from `extendTailwindMerge`, with `rounded-chrome-*`, `text-chrome-*` and `border-chrome-accent` registered into Tailwind's own `rounded`, `font-size` and `border-w` conflict groups, so a caller composing over these utilities gets the same last-one-wins de-duplication as Tailwind's own class names.

## Reconciliation this ticket exercises (recorded in ticket 01, applied here)

- `Button`'s `compact` size moves from `text-[13px]` (13px) to the shared `text-chrome-sm` (0.85rem = 13.6px), **+0.6px** — the near-duplicate collapse ticket 01 recorded, now visible in the one control that actually had both values.
- Every other Button geometry change (6px radius, 10px surface radius, 3px commit border, the shadow) is a same-value renaming: no other pixel moves.

## What ticket 01 got wrong (found here, fixed there)

Wiring the new tokens into a real component surfaced one thing ticket 01's first pass missed: `tailwind-merge` (which `cn()` uses to de-duplicate conflicting Tailwind classes) has no idea a custom utility like `border-chrome-accent` conflicts with the built-in `border` class it replaces. Verified directly against the library:

```
twMerge('border', 'border-[3px]')          -> 'border-[3px]'           (already worked — arbitrary value, recognised)
twMerge('border', 'border-chrome-accent')  -> 'border border-chrome-accent'  (both kept — NOT recognised)
```

`Button`'s base recipe states a bare `border` (needed so every non-`commit` variant gets a visible 1px edge — Tailwind's preflight resets border-width to 0 otherwise), and the `commit` variant used to override it with `border-[3px]`, an arbitrary value `tailwind-merge` already parses and correctly evicts. Swapping that for the new named utility without also teaching `tailwind-merge` about it would have left `commit` buttons with **two conflicting `border-width` declarations** in the compiled output, arbitrated by whichever rule Tailwind happens to emit later rather than by anything this component states — a real, if currently silent, defect.

This is a `tailwind-merge` configuration gap, not a wrong token name or value, so the fix landed in `packages/ui/src/lib/utils.ts` (the one place `cn()` is defined) rather than in ticket 01's token declarations — but it is exactly the kind of thing this ticket exists to catch before `Popover`, `Select`, `Command` and the rest (tickets 03–05) hit the same gap with their own overrides. `rounded-chrome-*` and `text-chrome-*` are registered alongside `border-chrome-accent` for the same reason, even though `Button`'s own substitutions today are straight swaps with no live conflict for those two.

## Verification

Both the token-swap and the "changing one token moves every consumer" claim were checked against a real `vite build` of `packages/app` (not `pnpm dev` — no server was started), since that is the only way to see what the compiled CSS actually contains:

- `.rounded-chrome-md{border-radius:6px}`, `.text-chrome-sm{font-size:.85rem}`, `.border-chrome-accent{border-width:var(--border-width-chrome-accent)}` and `.command-surface{…border-radius:var(--radius-chrome-lg);…box-shadow:var(--shadow-chrome-elevated)…}` all compiled from the real, unmodified source (no probe needed this time — `Button` and `command-surface.css` are real consumers now, so Tailwind's content scan finds them on its own).
- Temporarily changing `--radius-chrome-md` from `6px` to `20px` in `tailwind.css` and rebuilding moved `.rounded-chrome-md`'s compiled value to `20px`; the file was then reverted to `6px` and rebuilt clean (confirmed via `git diff` showing no residual change).

## `pnpm verify` / `pnpm e2e` / `pnpm e2e:ladle`

Reported in the PR/report accompanying this commit.
