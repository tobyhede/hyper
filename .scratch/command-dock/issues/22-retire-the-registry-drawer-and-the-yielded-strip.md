# 22 — Retire the registry Drawer and the strip the shell yields to it

> **Renumbered from `16` by `tracker-hygiene/01`.** It shared that number with
> `16-create-thing-is-three-peers.md`, which `13` cites bare, so `16` stayed
> there. This ticket had seven citations, not six: `AGENTS.md`,
> `packages/ui/src/AppShell.tsx`, `packages/app/stories/design-system-inventory.ts`,
> `command-dock/08`, `command-dock/10` and this effort's `spec.md` name the
> file rather than the number and were followed; `packages/app/src/styles.css`
> cites it too, in its `.shell__main` comment, and the renumbering pass missed
> it — the comment carried the dangling pre-rename path until this correction
> caught it.

Status: resolved
Blocked by: nothing. `10` is what left all three without a consumer.

**The decision to take:** delete `drawer.tsx`'s `Drawer`, its `DRAWER_WIDTH`, and
`AppShell`'s `insetEnd` — or decide deliberately to keep them and say why here.
Three source-code comments currently say "taking these is a decision of its
own", and this file is that decision. Until it is taken, the drawer keeps its inventory
entry and `insetEnd` keeps its doc comment, and both point here.

**A fourth unconsumed thing was briefly filed here and has moved to `17`.**
`Button`'s `label` variant lost its last consumer to `09`, but the argument
below is about a hand-composed module with real implementation cost sitting
unconsumed, not about vendor drift — see the correction below, which found
there is no upstream copy this one drifts from or that `shadcn add` could
regenerate. A CVA variant carries no such cost: it is data on an existing
component, not a module of its own. Same failure, different question, so it
gets its own file.

**This ticket exists because two resolved tickets pointed at each other and
neither owned the work.** `10` wrote *"`08-retire-the-sidebar-era-primitives.md`
owns taking it"*; `08` is resolved, and its own handoff section says the pair are
*"not omissions from this ticket"* because they still had a consumer when it ran.
A `Status: resolved` ticket can carry a deferred tail — `docs/agents/issue-tracker.md`
says so — but it cannot be scanned for as work, and neither of those two can be
picked up. So the handoff stays recorded in `08` as history and the decision
lives here, with a status a reader can find.

## What has no consumer, and why

The Things list was a screen-edge drawer (`ThingsDrawer`, spelled `CardsDrawer`
in `08` and `10`, which predate ADR 0085's rename). `10` replaced it with a
Popover anchored to the Dock's own `Things ⌄` trigger, on the ground that a
screen-edge drawer occludes the canvas edge you are dropping onto. A Popover
floats over the canvas and yields no width, so the drawer and the strip the shell
yielded to it both went dark in the same change.

| Module or prop | Why it has no consumer |
| --- | --- |
| `packages/ui/src/components/drawer.tsx` | The `Drawer` and every part it exports. `ThingsDrawer` was the only mount. |
| `DRAWER_WIDTH`, from the same module | Exported so the surface the drawer overlaid could yield exactly that much. Nothing overlays and nothing yields. |
| `AppShell`'s `insetEnd` | The strip `.shell__main` yields at its end edge. Nothing sets it. |

## What deleting them would take with it

- `drawer.tsx`'s exports from `packages/ui/src/index.ts:202-215` — eleven
  values (`DRAWER_WIDTH`, `Drawer`, `DrawerClose`, `DrawerContent`,
  `DrawerDescription`, `DrawerHeader`, `DrawerPopup`, `DrawerPortal`,
  `DrawerTitle`, `DrawerTrigger`, `DrawerViewport`) and three types
  (`DrawerHeaderProps`, `DrawerPopupProps`, `DrawerSide`). `insetEnd` is not
  among them — it is a field on `AppShellProps` in `AppShell.tsx`, not a
  package export.
- `packages/ui/test/drawer.test.tsx`, which mounts the full composition. It is
  the component's own test rather than a consumer, which is why the "no
  consumer" table above does not count it and why it is easy to miss.
- `packages/ui/src/components/drawer.tsx`'s inventory entry in
  `packages/app/stories/design-system-inventory.ts` — `ui:catalog:check` reports
  an entry whose module is gone, so the entry cannot be forgotten.
- The comment above `.shell__main` in `packages/app/src/styles.css` that
  explains the yielded strip. `.shell__main` itself declares only `flex: 1;
  min-height: 0;` — there is no `padding-inline-end` declaration to take with
  it, that padding being applied inline from `AppShell` and already counted
  below. The `shell` block survives and so does its `handRolledStyles` entry,
  whose reason names viewport ownership rather than the strip.
- `AppShell`'s `style={{ paddingInlineEnd: insetEnd }}` and the `shell__area`
  JSX comment that explains why the notice needs a containing block the strip
  has already been taken out of. The element itself stays: it is also the
  positioning containing block.
- `AppShell`'s own function-level doc comment — not the `insetEnd` prop's. It
  names three things the shell does for a canvas that cannot do them for
  itself, the second being "yield the strip a drawer overlays"; losing that
  clause drops the count from three to two and falsifies the sentence as
  written.
- The `.shell__area` comment in `packages/app/src/styles.css`, which opens
  "What is left of the main area once the strip is yielded, and the
  containing block everything positioned inside it resolves against." Only
  the first clause goes with the strip; the second stays true and
  load-bearing, the same reason the bullet directly above keeps the element
  itself. So this comment is rewritten rather than deleted, the way the
  `AppShell` bullet above handles its own comment. It remains a CSS rule
  comment, a different one from the `shell__area` JSX comment above — both
  describe the same strip from opposite sides of the component boundary.

Nothing leaves `packages/ui/package.json`: `drawer.tsx` composes
`@base-ui/react/drawer`, and that dependency is every other primitive's too.

## Why it is not obvious, and is a decision rather than a chore

`08` set the rule and satisfied it by taking the decision in the open:
*retiring a primitive an ADR names is a foundation decision, not a surface one*.
The two arguments it weighed apply here with different force.

**For deletion.** The premise this argument used to rest on does not hold:
`drawer.tsx` is not a shadcn registry component. Its own doc comment says it is
composed from Base UI's own `Drawer` rather than the registry's, which is
`vaul` and therefore Radix — and, in that same comment's own words, taking
`vaul` "would stand a second dialog, focus and animation stack beside the one
every other surface here uses." `vaul` itself is nowhere in the tree, and
ADR 0050 is what refuses it in general terms: Base UI is chosen once for every
wrapper, and "do not mix Radix and Base UI wrappers" is the sentence a
vaul-based drawer would break. (`cmdk`, wrapped by `Command.tsx`, is the one
third-party primitive standing beside `@base-ui/react`. ADR 0050's own text
does not name it — `docs/agents/ui.md` is where the decision not to migrate it
is recorded, on the ground that it is a search primitive rather than a Radix
wrapper.) So `shadcn add drawer` does not regenerate this file; it would
produce a different component on a dependency the repo does not have and
deliberately rejected. There is no upstream copy for the stored one to drift
from, and deleting it costs a rewrite of the Base UI wrapper, not a
`shadcn add`, should the pattern be wanted again. Deletion is still the guarded
path on its own separate terms: an inventory entry pointing at a deleted module
fails `ui:catalog:check`, where a rewritten reason is prose only a reader can
check.

**For keeping.** Unlike the seven `08` took, no ADR made these dead. ADR 0082
retired the gutter and killed the Sidebar; nothing retires a drawer as such, and
`10` chose a Popover for *the Things list* rather than ruling the pattern out of
the product. `DrawerPopup` also carries real work of its own —
`--drawer-swipe-movement-x` tracking and the `data-swiping` transition-drop —
that a rewrite would have to redo from nothing, there being no regenerated copy
to carry it instead. And `insetEnd` is the shell's one answer to "something
overlays the end edge", which the next such surface would have to rewrite
rather than pass.

That tension is the thing to settle. It is not settled by this file.

**A note on this file's own title and the word "registry" above.** Both are
inherited from `08` and `10`, which called this "the registry Drawer" before
anyone checked the claim; the correction above found it false. Renaming the
file is not worth it on its own — six other sites already cite it by filename,
and `tracker-hygiene/01`'s renumbering pass already missed one citation once —
so the title stands as written. Read `Drawer` throughout this file as
`packages/ui/src/components/drawer.tsx`'s hand-composed Base UI wrapper, not a
stored copy of a shadcn registry component.

## Not a defect and not blocking anything

No production surface renders any of the three, so there is no behaviour to
regress and no user-visible consequence to leaving them. The cost of carrying
them is an unconsumed primitive and three doc comments a reader has to
reconcile.

## Not the only primitive posing this question

`packages/ui/src/Command.tsx`, `packages/ui/src/Dialog.tsx`,
`packages/ui/src/Select.tsx` and `packages/ui/src/components/empty.tsx` each
carry their own unconsumed-primitive entry in
`packages/app/stories/design-system-inventory.ts`. `Command.tsx`'s reason says
retiring a primitive an ADR names is a foundation decision, not a surface one;
`Dialog.tsx`'s reason says, in nearly the same words, that retiring a primitive
is a foundation decision rather than a surface one. `Select.tsx`'s reason sits
in the same category — unconsumed since ADR 0089, kept meanwhile rather than
decided — without repeating that phrase. `empty.tsx`'s reason names
`Command.tsx` directly: deliberately without a consumer for the same reason —
a shadcn registry primitive for an empty result set, superseded by Base UI's
own `ComboboxEmpty`. None of the four has an owning ticket the way this file
now is one for the Drawer.

`empty.tsx` is the most relevant of the four to the argument two sections
above, because unlike the Drawer it genuinely *is* a shadcn registry
component — so the "we can regenerate it" premise this file found false for
the Drawer may actually hold for it. The four do not all pose an identical
question; this file does not decide that either, it only widens the note.
(Worth flagging in passing: this section itself once listed three, the same
kind of hand-built enumeration the "Sites that cite this ticket" section below
warns a reader to re-derive by grep rather than trust.)

Whether that decision is best taken primitive by primitive, the way this file
takes it for the Drawer, or once for the shape of the question as a whole, is
itself a choice worth making on the record — this file already reasons about
exactly that kind of boundary, above and in distinguishing the Drawer's
question from `Button`'s `label` variant. This is not a proposal to file four
more tickets or to fold them into this one; it is a note that the question
generalises, for whoever takes it up.

## Sites that cite this ticket

Each says the retirement is undone and points here. If the decision is taken
either way, all six are edited with it.

- `packages/ui/src/AppShell.tsx` — `insetEnd`'s doc comment.
- `packages/app/stories/design-system-inventory.ts` — the `drawer.tsx` entry.
- `packages/app/src/styles.css` — the comment above `.shell__main`.
- `AGENTS.md` — the `ui` package bullet.
- `.scratch/command-dock/issues/10-decide-the-cards-surface.md` — the line that
  used to name `08` as the owner.
- `.scratch/command-dock/spec.md` — this ticket's row, which carries its status.

**This list was five until the same correction that fixed the blockquote above.**
It omitted `spec.md`, and the blockquote omitted `styles.css` — two hand-built
enumerations of the same ticket's citations, each short by a different one. That
is worth naming rather than quietly fixing: the renumbering pass that missed
`styles.css` was following a list exactly like this one, and nothing in `verify`
checks that a cited ticket path resolves
(`.scratch/tracker-hygiene/issues/01-a-ticket-number-is-claimed-once.md` records
that gap). Anyone taking the decision should re-derive this list by grep rather
than trusting it.

`08`'s own handoff table is left as history and points here for the decision.

## Answer — 2026-09-21

**All three are deleted.** `packages/ui/src/components/drawer.tsx` and its test,
the eleven values and three types it exported from `packages/ui/src/index.ts`,
its inventory entry, and `AppShell`'s `insetEnd` with the inline
`paddingInlineEnd` it set. The shell now does two things rather than three, and
its doc comment says so.

The reason is that they are old and obsolete, and the argument above for keeping
turned out to be weaker than it was written. "Deleting it costs a rewrite of the
Base UI wrapper" ignores version control: the file is recoverable from history,
and the only real cost of bringing it back is whatever Base UI's API has moved by
then. That leaves no consumer, no planned consumer, a recorded decision (`10`)
against a screen-edge drawer for the one surface that had one, and a test, an
inventory reason and three comments that each had to be kept true for nothing.

Comments rewritten rather than deleted, because a clause of each outlived the
strip: `AppShell`'s function-level doc comment, the `shell__area` JSX comment,
the `.shell__area` CSS comment (both now say only that it is the containing
block the notice resolves against), and the Dock's docking-box comment in
`packages/app/src/App.tsx`, which said a drawer at the end edge narrowed the
area. Both paragraphs above `.shell__main` in `styles.css` went whole: the
second was the case for not animating a strip that no longer exists.

Left alone, and not this ticket's: `App.tsx`'s `addExistingResource` comment,
`canvas-projection.ts` and `entity-actions.tsx` still call the Resources Popover
"the drawer" — stale naming for a surface that exists, not a reference to the
deleted module. `08` and `10` are resolved and keep their pointers here as
history. The four sibling primitives above are still undecided.

This ticket's body predates the Thing → Resource and Diagram → Map rename and is
left in the vocabulary it was written in; this Answer uses the current names.
