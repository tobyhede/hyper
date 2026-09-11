# 10 — Decide the Cards surface: popover or drawer

Status: resolved
Tags: release/v1
Blocked by: nothing. `07` is what left the two designs standing side by side.

**Decided: the list is a Popover anchored to the `Cards ⌄` trigger, and
`CardsDrawer` is deleted.** This ticket was filed as an open question and it was
not one — the comparison had already been made and recorded, and `07` deleted
the record while promoting the Dock. The rest of this file is the restored
comparison, why it was lost, and what the restoration cost.

## The comparison, restored verbatim

This stood above the prototype's Cards list in
`packages/app/stories/review/command-dock.stories.tsx`. It is recoverable at
`git show f7b5470f^:packages/app/stories/review/command-dock.stories.tsx`.

> **The list is a Popover, and that is decided.**
>
> Three surfaces were compared here — a Drawer from the screen edge, a Popover
> anchored to its trigger, and a second dock of its own — over a Space with
> twenty-nine unplaced Cards, which is the scale that separates them. The
> Popover won on the two things the comparison was for: it is anchored to the
> control that opened it the way the menus beside it are, so the Dock reads as
> one surface rather than a bar that sometimes summons a panel; and a drag out
> of it survives its own dismissal, so adding several Cards costs one
> disclosure rather than one each.
>
> What the other two cost is why they went. The Drawer occludes the edge of
> the canvas you are dropping onto, and it is a screen-level surface answering
> a control-level question. The panel is furniture: it has to be positioned,
> it stays until closed, and choosing it means choosing that once per list —
> two docked docks plus two panels was more than the canvas could carry.

The prototype's header carried the same answer in one line: "A list — Cards or
Spaces — is a **Popover** anchored to the control that opened it; the Drawer and
the second docked panel are gone with their switch."

## Why it was lost

Two deletions, and only one of them was decided.

**The popover not shipping was decided**, in `07`, on grounds that are entirely
about evidence weight rather than about the design: `CardsDrawer` was "an
evidenced surface with seven parity claims, its own stable story sheet, its own
Ladle spec and its own unit tests", shipping both would be the second place
commands live that ADR 0082 rules out, and "retiring an evidenced production
surface is a second promotion rather than a side effect of this one". None of
the comparison's findings is engaged anywhere in that reasoning. The ADR 0052
ratchet, which exists to stop surfaces drifting without evidence, had the side
effect of protecting the surface that lost the comparison — because the winner's
evidence sat in a file whose first line reads `THROWAWAY UX PROTOTYPE`, and under
the ratchet that counts for nothing.

**The record vanishing was not decided.** `07` promoted the prototype by
renaming `stories/review/command-dock.stories.tsx` to
`src/components/CommandDock.tsx`. Everything that shipped kept its doc comments —
`CreateMenu`'s survived verbatim. The Cards list did not ship, so its code went,
and the comparison went with the code it was attached to, because it had been
written inside the implementation it justified.

Nobody noticed. `07` says the comparison is "recorded at the top of the
prototype" and this ticket's own first draft said "the prototype sheet's own
comparison is the starting point" — both written in the commit that destroyed it.
A one-line paraphrase of the *outcome* did survive, on `DockCards.surface`
(`CommandDock.tsx`), but not one of the reasons.

**The rule this earns:** a decision written inside the code it justifies dies
with that code. The comparison now lives above `CardsPopover`, the thing that
won, and in this file. Losing both takes two deliberate deletions.

## Acceptance

- [x] The decision recorded, with the comparison, wherever a treatment decision
      belongs — here, and above the component that won it.
- [x] The losing surface deleted, its parity claims retired and its inventory
      entry with them.
- [x] The winner's claims cover what the loser's covered, so the count of things
      proved does not fall.

## What the restoration changed

- `packages/app/src/components/CardsPopover.tsx` replaces `CardsDrawer.tsx`. It
  is a `Popover` anchored to the Cards trigger, drawn by the Dock rather than
  handed to it, and it keeps every behaviour the drawer had: the search, the
  kind filter, whole-Title search across an Alias's Target and a Space Card's
  Space, the drag source, the row as a button, the refusal that stays on the
  surface, and the empty-state sentences. **What it does not keep is the
  drawer's production `CanvasCard` fronts.** A Card front at row scale was
  mostly empty paper with a title too small to read at 117x66, so a row is a
  compact strip — a drag grip, the kind glyph and the name — and the three row
  treatments that were compared are recorded above `RowGrip`.
- **`DockCards.surface` is gone.** The slot existed because the drawer was a
  foreign component the Dock could only be handed; the Dock draws this list, so
  the Dock owns its open state through `useDockDisclosure` and the exclusivity
  that comes with it. That is the sentence on `DockCards.surface` reversed, and
  deliberately.
- The Cards disclosure takes the one stable disclosure id in the Dock,
  `command-dock-cards`, because it is the one disclosure the application
  addresses and the Dock has to be able to seed its slot with before any
  control has mounted to mint a `useId`. It opens on a created Layout and on an
  addressed Card the selected Layout does not place. Every other disclosure
  keeps its `useId`, and so does this one's trigger, because every open Space
  keeps its Dock mounted.
- `AppShell`'s `insetEnd` and `DRAWER_WIDTH` plumbing is gone from `App`: an
  anchored popover floats and yields no width, which is the occlusion the
  comparison held against the drawer.
- `packages/ui/src/components/drawer.tsx` lost its last consumer. Retiring a
  registry primitive is a foundation decision rather than a surface one, so it
  is recorded in the inventory and `08-retire-the-sidebar-era-primitives.md`
  owns taking it.
- The seven `cards-drawer-*` parity claims are ten `cards-popover-*` claims,
  with their Ladle and application halves moved across. The seven cover the
  same behaviours; the three new ones are what this change added and had to
  prove — the keyboard Add that keeps the reader in the list, the Meta Space's
  Spaces as a second source, and the filter counts.

## Found while finishing it: the story evidence was hollow

`CardsPopover`'s hand-rolled rules landed in `command-dock.css`, and
`CardsPopover.tsx` imported no stylesheet — so the Dock, which imports that
file, drew a styled list while a story mounting the component on its own drew a
bare `<ul>`. Every `cards-popover-*` Ladle claim was being checked against an
unstyled component: the row grip, the filter box and the bound the list scrolls
inside were all invisible to the half of the evidence that exists to see them.

`pnpm e2e:ladle` is what caught it — the scroll assertion over eighteen rows
came back false — and nothing else could have. The application suite passes
either way, because the application mounts the Dock.

The rules are now `packages/app/src/components/cards-popover.css`, imported by
the component, which is the repository's own convention (`canvas-card.css`,
`card-search-combobox.css`, `markdown-source-editor.css`) and the only
arrangement under which mounting the component is enough to draw it. The rule
worth carrying: **a component whose stylesheet is imported by its mounter has
story evidence that proves nothing about how it looks.**

## The filter, decided the same way and recorded in the same place

**Decided: a glyph and a count, in a control with a box.** That is variant H of
ten drawn at the list's real 288px width in a throwaway review sheet,
`packages/app/stories/review/cards-filter.{stories.tsx,css}`. The sheet is
**spent and deleted**: the comparison below is what it was for, and it is
recorded here rather than beside the code, which is the rule the first half of
this ticket earned. It is recoverable from this branch's history if the ten
variants are ever wanted again.

The row first shipped as four bare glyph toggles and failed twice over.

- **It did not look pressable.** No border, no ground: four marks sitting on
  the popover's paper, read as decoration. A control that can be pressed says
  so *before* it is pressed — and once the box carries the affordance, the fill
  is free to mean only "on" instead of carrying both.
- **It answered the wrong question.** A reader at this surface wants to know
  whether the thing they are after is in here at all. Four unlabelled marks
  can only be interrogated by pressing them and watching the list move.

What was compared, and what each cost:

| | | Cost |
| --- | --- | --- |
| A | Glyphs only (shipped) | No affordance, no naming. The row that prompted the sheet. |
| B | Glyph and word | Wraps to two lines at 288px; the filter ends up taller than the search field above it. |
| C | Segmented bar | Does not fit — the fourth segment is cut off mid-word. A joined bar also reads as an exclusive choice, and these are independent switches. |
| D | Words only | Fits on one line and is unambiguous, but shares no vocabulary with the rows below, where every row carries a glyph. |
| E | Checklist | Four lines of vertical space above the list the surface exists to show, and a checkbox is a form control where there is no form. |
| F | Counted rows | E's cost plus the count. This is where the count's value was found. |
| G | Glyph buttons | Fixes the affordance and not the naming. |
| H | **Glyph and count badge** | **Chosen.** The badge is the widest thing in a 28px control, so the row is nearly the panel; a three-digit count in a large Space would push it over. |
| I | `Filter [] [] [] []` | One word says the row is a filter, but it is permanent furniture and names the row rather than any switch. |
| J | Filter dropdown | Costs a press before you can read anything, on the control whose job is to say what you are looking at — and in the product it is a popover inside the Cards popover, whose dismissal rules are already hand-written. |

**Two things the choice commits to, both now under test.**

The count **answers the search**, not the Space. F's recorded cost was that a
number beside a name that disagrees with the rows under it is worse than no
number, so the count is computed over the filtered corpus and moves as the
reader types. And a switch that is **off** goes on counting, because the number
is what says whether turning it back on is worth the press. A zero is drawn
rather than hidden: "none of these match" is the answer most worth having.

**The naming problem is unresolved and was not settled by this.** Three of the
four switches are Card kinds and the fourth is a second source; "Space Cards"
and "Spaces" are the honest names and are nearly the same string. Every labelled
variant reached for **Frames** as a short word for a Space Card, which the
product does not otherwise use — adopting it is a `CONTEXT.md` vocabulary
decision rather than a layout one, and H does not need it. The accessible names
carry the long forms, so the distinction is available to a screen reader and is
carried visually by the frame-versus-cube pair alone.

## Comments

**Raised by `07`'s "Found while building it".** Recorded there as "it wants its
own ticket too" and tracked nowhere, which is what a status scan misses
(`docs/agents/issue-tracker.md`). This is that ticket.
