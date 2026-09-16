# 07: Dormant components consume the tokens, or are removed

**What to build:** Two components that hold many arbitrary values are resolved — kept and migrated, or removed — rather than migrated on the assumption that they survive.

**This ticket's opening premise was wrong on both counts, and the Decision section below is what checked it.** The premise is left here rather than rewritten, because the way it was wrong is the useful part: both claims came from a grep that matched a name in a comment or at file level instead of a real import.

The premise as written:

> `Select`, with a single consumer in the Graph HUD, and `PaletteColorPicker`, with none. Between them they hold about thirty-seven values, a quarter of the whole effort, for surfaces that are barely drawn.

Neither half holds. `Select` has **zero** consumers, not one — the Graph HUD names it in a comment about `shadow-lg` and does not import it. `PaletteColorPicker.tsx` is **not** consumer-less — three of its exports are live in the Dock and the Thing rail, and only the top-level component function is unused.

The separation into its own ticket was still right, for the reason given: migrating a component that is about to be removed is wasted work, and removing one that is about to be needed is worse. So this ticket decides first and then acts. It just had to correct what it was deciding about first.

Whichever way it goes, the outcome is the same for ticket 08: no arbitrary structural value survives in these files, because the files either consume the scale or are gone.

**Every new `*-chrome-*` utility this ticket introduces must also be registered in `extendTailwindMerge` beside `cn()`.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name, so an unregistered one does not evict the built-in class it replaces and two conflicting declarations ship. The build stays green and no test fails, so nothing reports it. Ticket 08 adds the permanent check; until then this is a step to remember.

**Blocked by:** 02.

**Status:** resolved

## Decision

**Both components are kept and migrated. Neither is removed.**

**`Select`** has zero production consumers at this commit (`faa5e0b7`) — a repo-wide
grep for `SelectTrigger`/`SelectContent`/`SelectItem`/`SelectValue`/`SelectGroup`
finds only `packages/ui/src/Select.tsx` itself and the barrel re-export in
`packages/ui/src/index.ts`; `GraphHud.tsx` names `Select` only in a prose comment
about `shadow-lg`, not as an import. (The ticket text's framing of "one consumer
in the Graph HUD" does not hold at this commit — that consumer, if it lands,
belongs to ticket 05's in-flight work in its own worktree, not to anything on
this branch.) Despite having no consumer, `Select` already carries a
`design-system-inventory.ts` entry recording exactly this situation, and
`CLAUDE.md` narrates it as a **recurring, accepted** state rather than a defect:
"`Select` has **no consumer again**... It spent a while with none before, after
ADR 0053 deleted the three renderer selectors, and it carries an inventory entry
meanwhile." The codebase's own precedent for a dormant registry primitive
(`Dialog.tsx`, `Command.tsx`, `components/drawer.tsx`, `components/empty.tsx` —
all listed in the same inventory, all kept) is explicit that "retiring a registry
primitive is a foundation decision rather than a surface one" — not a decision to
fold into a token-migration ticket. Per the setup instructions, removing `Select`
would also require editing `GraphHud.tsx`, which ticket 05 is editing concurrently
in another worktree; since the evidence favours keeping it, that conflict does not
need to be raised to the human. **Kept, migrated.**

**`PaletteColorPicker.tsx` (the file) is not actually consumer-less.** The file
exports four things: `PaletteColorSwatchGrid`, `paletteSwatchPanelClassName`,
`PaletteColorEntry`, and the standalone `PaletteColorPicker` component. The first
three are live production code — `IdentityMenuActions.tsx`'s `GraphMenuActions`
spends `PaletteColorSwatchGrid` and `paletteSwatchPanelClassName` inside a
`DropdownMenuSub`, and `GraphMenuActions` is itself mounted by both
`CommandDock.tsx` and `SpaceThingRailClusters.tsx` — the Dock's and the Space
Thing rail's Graph colour commands. Only the top-level `PaletteColorPicker`
function (the popover-wrapped variant with its own trigger) has no production
importer; its sole caller is its own Ladle story
(`stories/components/palette-color-picker.stories.tsx`). Git history shows this
was deliberate, not oversight: the commit that introduced it (`b9fe0a0cf`,
"Adopt Tableau 20 and replace Graph colour radio menu with swatch grid") states
"the Dock opens them through Colour… and a **reusable** `PaletteColorPicker` for
other closed palettes" — i.e. `PaletteColorSwatchGrid` was factored out for the
Dock's menu use, and `PaletteColorPicker` was deliberately generalised as a
popover-triggered building block for a *future* closed-palette surface, not
speculative dead code. It carries a dedicated unit test
(`packages/ui/test/PaletteColorPicker.test.tsx`) and a dedicated Ladle-e2e spec
(`packages/app/ladle-e2e/palette-color-picker.spec.ts`), and it is not listed in
`uncataloguedComponents` because its story satisfies the catalogue check.
Corroborating evidence: ticket 10 (`10-dark-theme-shadows-survive-on-four-surfaces.md`)
names `PaletteColorPicker.tsx` as one of the four surfaces still carrying a
dark-theme shadow defect to be fixed *later*, which presupposes the file survives
this ticket. **Kept, migrated** — deleting only the unused `PaletteColorPicker`
function while its sibling exports in the same file stay would split one small
file into two for no product reason, and the evidence above treats it as a
reusable primitive awaiting its next caller rather than orphaned code.

**Ticket 10's scope did not shrink.** Both surfaces it names — `Select.tsx` and
`PaletteColorPicker.tsx` — still exist after this ticket, so neither was removed
from ticket 10's four. One observation for ticket 10 worth recording: `Select.tsx`
does not currently carry `shadow-[0_12px_40px_rgba(0,0,0,0.5)]` as a live class —
that string only appears in a documentary comment (the popup already uses
`shadow-lg`), identical to `Popover.tsx` beside it. `PaletteColorPicker.tsx`'s
`drop-shadow-[0_0_1px_rgba(0,0,0,0.85)]` (on the swatch grid's selected-check
icon) *is* still a live class, left untouched as instructed. Neither shadow value
was touched by this ticket.

## Substitutions made

`Select.tsx`:
- `rounded-[6px]` -> `rounded-chrome-md` (`SelectTrigger`, `SelectContent`'s `Popup`) — ×2
- `rounded-[4px]` -> `rounded-chrome-sm` (`SelectItem`) — ×1
- `text-[0.85rem]` -> `text-chrome-sm` (`SelectTrigger`, `SelectItem`) — ×2

`PaletteColorPicker.tsx`:
- `rounded-[6px]` -> `rounded-chrome-md` (swatch button in `PaletteColorSwatchGrid`, `PopoverTrigger` in `PaletteColorPicker`) — ×2
- `rounded-[4px]` -> `rounded-chrome-sm` (swatch inner span in `PaletteColorSwatchGrid`) — ×1
- `text-[13px]` -> `text-chrome-sm` (`PopoverTrigger`, grows 13px -> 13.6px per ticket 01's reconciliation) — ×1

Total: 9 substitutions, matching the ticket's substitution table exactly (4 + 2 + 2 + 1).
No new token was added; `--radius-chrome-md`/`--radius-chrome-sm`/`--text-chrome-sm`
and their `extendTailwindMerge` registrations already existed from tickets 01/06.
Colour tokens wrapped as arbitrary values (`text-[var(--foreground)]`,
`border-[var(--border)]`, etc.) in both files were left alone for ticket 11.

- [x] Whether each component is kept or removed is decided and the reason recorded
- [x] A kept component states no structural arbitrary value
- [x] A removed component leaves no consumer, and its design-system inventory entry goes with it (n/a — neither removed)
- [x] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [x] Every new `*-chrome-*` utility is registered in `extendTailwindMerge`, and a conflicting built-in class is evicted (n/a — no new utility; existing registrations from tickets 01/06 reused)
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
