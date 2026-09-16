# 03: Live `@project/ui` root components consume the tokens

**What to build:** The two live root components of the shared UI package — `Command` and `Popover` — draw their geometry from the scale instead of stating it inline. Together they are the largest concentration of arbitrary values in the package (`Command` alone holds 27), and both are on screen constantly: `Command` backs the Dock's menus, the Things popover and the shell notice, and `Popover` backs the Dock, the selected-Edge controls and the Graph HUD.

After this ticket a token change reaches every menu and popover in the product, not just its buttons.

**Every new `*-chrome-*` utility this ticket introduces must also be registered in `extendTailwindMerge` beside `cn()`.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name, so an unregistered one does not evict the built-in class it replaces and two conflicting declarations ship. The build stays green and no test fails, so nothing reports it. Ticket 08 adds the permanent check; until then this is a step to remember.

**Blocked by:** 02.

**Status:** resolved

- [x] `Command` and `Popover` state no structural arbitrary value
- [x] Every menu, popover and command list in the product follows a token change
- [x] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [x] Every new `*-chrome-*` utility is registered in `extendTailwindMerge`, and a conflicting built-in class is evicted
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported

## What changed

**`packages/ui/src/Command.tsx`** (all six structural arbitrary values in the substitution scope):

- `CommandInput`: `rounded-[6px]` → `rounded-chrome-md`; `text-[0.85rem]` → `text-chrome-sm`
- `CommandList`: `rounded-[6px]` → `rounded-chrome-md`
- `CommandEmpty`: `text-[0.8rem]` → `text-chrome-xs`
- `CommandGroup`: `text-[10px]` (the uppercase group heading) → `text-chrome-2xs`
- `CommandItem`: `rounded-[4px]` → `rounded-chrome-sm`; `text-[0.85rem]` → `text-chrome-sm`

**`packages/ui/src/Popover.tsx`**: `PopoverContent`'s popup `rounded-[6px]` → `rounded-chrome-md`. The file's existing doc comment already correctly describes `PopoverPopup`'s shadow as the theme's `shadow-lg`, past tense referring to a prior arbitrary `shadow-[0_12px_40px_rgba(0,0,0,0.5)]` that was replaced before this ticket — that shadow substitution was already done, is unrelated to the radius change here, and is out of this ticket's scope (ticket 10 owns the dark-theme-shadow decision; this ticket touched no shadow).

Total: three `rounded-[6px]` sites (two in `Command.tsx`, one in `Popover.tsx`), one `rounded-[4px]` site, two `text-[0.85rem]` sites, one `text-[10px]` site and one `text-[0.8rem]` site — matching the ticket's substitution table exactly.

**`packages/ui/src/lib/utils.ts`**: untouched. `rounded-chrome-md`, `rounded-chrome-sm`, `text-chrome-sm`, `text-chrome-2xs` and `text-chrome-xs` were already registered in `extendTailwindMerge` by tickets 02 and 04 — verified against the file's current `classGroups` before editing, and again by inspecting a real `vite build`'s compiled CSS (see Verification). No new utility name needed adding.

**`packages/app/src/tailwind.css`**: untouched. All five tokens this ticket consumes already existed from ticket 01 (including its "Inventory completion" follow-up, which pre-emptively renamed `--radius-chrome-lg`→`--radius-chrome-xl` for the unrelated 10px surface and set `--text-chrome-xs` to `0.75rem`).

## The one delta

**`Command.tsx`'s `CommandEmpty` (the empty/description text) shrinks 0.8px.** It was `text-[0.8rem]` (12.8px); the token `--text-chrome-xs` is `0.75rem` (12px), per ticket 01's "Inventory completion" tiebreak (12px/`0.75rem` appears at 3 sites across the repo, `0.8rem` at 1 — larger count wins). This is the recorded, expected reconciliation the ticket calls out, not a regression.

Every other substitution in both files is a same-value renaming: `rounded-[6px]`→`rounded-chrome-md` (6px, unchanged), `rounded-[4px]`→`rounded-chrome-sm` (4px, unchanged), `text-[0.85rem]`→`text-chrome-sm` (0.85rem, unchanged), `text-[10px]`→`text-chrome-2xs` (10px, unchanged).

## No stale comment found

Neither file carried a doc comment stating a specific pixel or rem value for the sites being changed (unlike ticket 04's `breadcrumb.tsx` case), so there was nothing to correct. `Popover.tsx`'s existing shadow comment names `shadow-lg` and the historical arbitrary shadow value it replaced, both still accurate after this change; it does not mention radius.

## No test named the old class

Neither `Command.tsx` nor `Popover.tsx` has its own unit test in `packages/ui/test`. The one related test, `packages/ui/test/Popover.test.tsx`, asserts only on the shadow class (`shadow-lg`) and is unaffected by the radius substitution. No other test in the tree (searched `packages/*/test`, `packages/app/stories`) asserts the literal `rounded-[6px]`, `rounded-[4px]`, `text-[0.85rem]`, `text-[0.8rem]` or `text-[10px]` against a `Command`/`Popover` consumer; the one hit outside these two files (`packages/app/stories/review/create-thing-permutations.stories.tsx`) is an unrelated icon-sizing literal, not a `Command`/`Popover` consumer, and is left alone.

## Verification

Same method as tickets 02 and 04: a real `pnpm --filter @project/app build` (not `pnpm dev`), then reading the compiled CSS.

- `.rounded-chrome-md{border-radius:6px}`, `.rounded-chrome-sm{border-radius:4px}`, `.text-chrome-sm{font-size:.85rem}`, `.text-chrome-2xs{font-size:10px}` and `.text-chrome-xs{font-size:.75rem}` each compiled to exactly one declaration with the expected value — no duplicate or conflicting rule from an unregistered utility, confirming the existing `extendTailwindMerge` registration (from tickets 02/04) already covers all five names.
- The literal `.rounded-\[6px\]{border-radius:6px}` and `.rounded-\[4px\]{border-radius:4px}` rules are still present in the compiled CSS, sourced from the untouched, out-of-scope `Select.tsx` and `PaletteColorPicker.tsx` (ticket 05) — confirming this ticket's edit didn't touch anything beyond its two named files.

## `pnpm verify` / `pnpm e2e` / `pnpm e2e:ladle`

`pnpm verify` passed clean on a second run: 221 test files, 2708 tests (a first run had one unrelated timeout flake in `packages/app/test/dock-commands.test.tsx`'s `withhold Delete from a story, which cannot empty the Space`, which passed cleanly re-run alone — consistent with the parallel-worktree contention this effort's other tickets recorded, and untouched by this ticket's two files).

`pnpm e2e` on the full run reported 205 passed, 8 failed, all 8 as `Error: Port 5300/5301/5303/5306/5308/5309/5310 is already in use` in `dock-interactions.spec.ts` and `space-routing.spec.ts` — three other agents were running in parallel worktrees on the same machine at the time. Re-running each affected spec file alone: `dock-interactions.spec.ts` 14/14 passed, `space-routing.spec.ts` 22/22 passed. Neither file, nor anything they exercise, touches `Command.tsx` or `Popover.tsx`'s consumers in a way this ticket's substitution could affect.

`pnpm e2e:ladle` passed clean: 103/103.
