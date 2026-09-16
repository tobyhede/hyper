# 04: Registry-derived components consume the tokens

**What to build:** The generated shadcn-derived components in the UI package's `components` directory draw their geometry from the scale: the toggle group, input group, combobox, tooltip, dropdown menu, drawer and breadcrumb.

These carry roughly sixteen arbitrary values between them, most in ones and twos. The batch is separated from ticket 03 because these files are regenerable from the registry and a future regeneration will reintroduce upstream's own spellings — so this ticket also records, for the next person to run the generator, that the substitution is part of landing a regenerated component rather than a one-time cleanup.

**Every new `*-chrome-*` utility this ticket introduces must also be registered in `extendTailwindMerge` beside `cn()`.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name, so an unregistered one does not evict the built-in class it replaces and two conflicting declarations ship. The build stays green and no test fails, so nothing reports it. Ticket 08 adds the permanent check; until then this is a step to remember.

**Blocked by:** 02.

**Status:** resolved

- [x] Each named component states no structural arbitrary value
- [x] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [x] The regeneration consequence is recorded where the next person to regenerate will find it
- [x] Every new `*-chrome-*` utility is registered in `extendTailwindMerge`, and a conflicting built-in class is evicted
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## What changed

Of the seven named files, only three held a structural arbitrary value in scope (radius, type size, border width, shadow); the other four (`input-group.tsx` aside from its excluded `calc()` values, `combobox.tsx`, `dropdown-menu.tsx`, `drawer.tsx`) already stated none — their own arbitrary values are spacing (`min-w`, `max-h`, `h`, `ml`/`mr`) or non-structural (`ease-[cubic-bezier(...)]`), both out of this ticket's scope, so they needed no edit to satisfy the first checkbox.

**`packages/ui/src/components/tooltip.tsx`**: the arrow's `rounded-[2px]` → `rounded-chrome-2xs`. A comment above the line records the regeneration consequence.

**`packages/ui/src/components/toggle-group.tsx`**: `rounded-[6px]` → `rounded-chrome-md` and `text-[13px]` → `text-chrome-sm` on `ToggleGroupItem`, plus a doc-comment note. This file is a hand-written Base UI wrapper rather than the registry's own Radix `toggle-group.tsx` (see its header comment), so a regeneration would not literally overwrite it — but the note is there for whoever next touches this primitive's geometry.

**`packages/ui/src/components/breadcrumb.tsx`**: `compact` size's `text-[13px]` → `text-chrome-sm`. The doc comment above `breadcrumbListVariants`, which used to assert "the 13px the command surfaces are drawn at," is corrected to name the token and its value instead — the reconciliation below moves the actual number, so the old comment would otherwise assert something no longer true. The `compact` variant is Hyper's own addition, not shipped by the registry (also stated in the file's header comment), so the existing "documented on the variant below" pointer already carries the regeneration consequence.

**`packages/ui/src/lib/utils.ts`**: untouched. `rounded-chrome-2xs`, `rounded-chrome-md` and `text-chrome-sm` were already registered in `extendTailwindMerge` by ticket 02, so no new utility name needed adding — verified against the file's current `classGroups` before editing, and again by inspecting a real `vite build`'s compiled CSS (see Verification).

**`packages/ui/src/components/input-group.tsx`**: untouched. Its three `rounded-[calc(var(--radius-md) ± Npx)]` sites are the nested-corner relationship to `--radius-md` ticket 01 excluded from the scale by name; they stay off it here too.

## Reconciliation this ticket exercises (recorded in ticket 01, applied here)

`toggle-group.tsx` and `breadcrumb.tsx`'s `compact` size are two of the four `13px` sites ticket 01 merged into `text-chrome-sm` (0.85rem = 13.6px) — the other two (`Button`'s `compact` size, `PaletteColorPicker.tsx`) belong to tickets 02 and (for `PaletteColorPicker.tsx`, which is `packages/ui/src` root, not `components/`) outside this ticket. Both sites here move **+0.6px**, the same merge, not a new decision.

`tooltip.tsx`'s arrow corner and `toggle-group.tsx`'s item corner are same-value renamings onto `rounded-chrome-2xs` (2px, an unmerged singleton) and `rounded-chrome-md` (6px) respectively — no pixel moves.

## A test that named the old class

`packages/ui/test/breadcrumb.test.tsx`'s `'takes the command-surface scale on request'` asserted `className` contained the literal `text-[13px]`. Updated to assert `text-chrome-sm` instead; the existing `not.toContain('text-sm')` assertion still holds, since `'text-chrome-sm'` does not contain `'text-sm'` as a contiguous substring.

## Noise found, left alone (out of this ticket's scope)

`text-[var(--foo)]`/`border-[var(--foo)]`-style arbitrary-value wrappers around an already-named token exist, but not inside `packages/ui/src/components/` — none of the seven named files have any. They are on the package's **root** components instead: `Popover.tsx`, `Command.tsx`, `Select.tsx` (all three: `border-[var(--border)]`, `bg-[var(--card)]`, `text-[var(--foreground)]`, etc., alongside their own `rounded-[6px]`/`rounded-[4px]`/`text-[0.85rem]`/`text-[0.8rem]` structural values, which are ticket 03's declared scope for `Command`/`Popover`), and `ThingKindIcon.tsx` (`text-[var(--muted-foreground)]`). Reported rather than changed, per the ticket's instruction.

## Verification

Same method as tickets 01 and 02: a real `pnpm build` (not `pnpm dev`) of `packages/app`, then reading the compiled CSS. `.rounded-chrome-2xs{border-radius:2px}`, `.rounded-chrome-md{border-radius:6px}` and `.text-chrome-sm{font-size:.85rem}` each compiled to exactly one declaration — no duplicate or conflicting rule from an unregistered utility, confirming the existing `extendTailwindMerge` registration already covers these three names (Button already used two of them; this ticket does not add a name the registration doesn't have).

## `pnpm verify` / `pnpm e2e` / `pnpm e2e:ladle`

Reported in the PR/report accompanying this commit. `pnpm verify` passed clean (221 test files, 2708 tests). `pnpm e2e` passed 207/210 on the full run; the 3 failures (`dock-interactions.spec.ts`, unrelated to any file this ticket touched) were network/navigation flakes — `net::ERR_NETWORK_IO_SUSPENDED` and "Execution context was destroyed, most likely because of a navigation" — confirmed by re-running that spec file alone, where all 14 tests including the 3 passed. `pnpm e2e:ladle` passed 103/103.
