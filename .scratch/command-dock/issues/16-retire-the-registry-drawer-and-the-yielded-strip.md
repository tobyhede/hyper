# 16 — Retire the registry Drawer and the strip the shell yields to it

Status: needs-triage
Blocked by: nothing. `10` is what left all three without a consumer.

**The decision to take:** delete the registry `Drawer`, its `DRAWER_WIDTH`, and
`AppShell`'s `insetEnd` — or decide deliberately to keep them and say why here.
Three sites of prose currently say "taking these is a decision of its own", and
this file is that decision. Until it is taken, the drawer keeps its inventory
entry and `insetEnd` keeps its doc comment, and both point here.

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
| `packages/ui/src/components/drawer.tsx` | The registry `Drawer` and every part it exports. `ThingsDrawer` was the only mount. |
| `DRAWER_WIDTH`, from the same module | Exported so the surface the drawer overlaid could yield exactly that much. Nothing overlays and nothing yields. |
| `AppShell`'s `insetEnd` | The strip `.shell__main` yields at its end edge. Nothing sets it. |

## What deleting them would take with it

- The three names' exports from `packages/ui/src/index.ts`.
- `packages/ui/src/components/drawer.tsx`'s inventory entry in
  `packages/app/stories/design-system-inventory.ts` — `ui:catalog:check` reports
  an entry whose module is gone, so the entry cannot be forgotten.
- The `padding-inline-end` declaration on `.shell__main` in
  `packages/app/src/styles.css`, with its comment. The `shell` block survives
  and so does its `handRolledStyles` entry, whose reason names viewport
  ownership rather than the strip.
- `AppShell`'s `style={{ paddingInlineEnd: insetEnd }}` and the `shell__area`
  comment that explains why the notice needs a containing block the strip has
  already been taken out of. The element itself stays: it is also the
  positioning containing block.

Nothing leaves `packages/ui/package.json`: `drawer.tsx` composes
`@base-ui/react/drawer`, and that dependency is every other primitive's too.

## Why it is not obvious, and is a decision rather than a chore

`08` set the rule and satisfied it by taking the decision in the open:
*retiring a primitive an ADR names is a foundation decision, not a surface one*.
The two arguments it weighed apply here with different force.

**For deletion.** A stored copy with no consumer is not the only record of a
registry component — `shadcn add drawer` regenerates it — and the stored copy is
the one that drifts from the registry in silence. Deletion is also the guarded
path: an inventory entry pointing at a deleted module fails `ui:catalog:check`,
where a rewritten reason is prose only a reader can check.

**For keeping.** Unlike the seven `08` took, no ADR made these dead. ADR 0082
retired the gutter and killed the Sidebar; nothing retires a drawer as such, and
`10` chose a Popover for *the Things list* rather than ruling the pattern out of
the product. `DrawerPopup` also carries real work a regenerated copy would not:
`--drawer-swipe-movement-x` tracking and the `data-swiping` transition-drop.
And `insetEnd` is the shell's one answer to "something overlays the end edge",
which the next such surface would have to rewrite rather than pass.

That tension is the thing to settle. It is not settled by this file.

## Not a defect and not blocking anything

Nothing renders any of the three, so there is no behaviour to regress and no
user-visible consequence to leaving them. The cost of carrying them is a
primitive that drifts and three doc comments a reader has to reconcile.

## Sites that cite this ticket

Each says the retirement is undone and points here. If the decision is taken
either way, all five are edited with it.

- `packages/ui/src/AppShell.tsx` — `insetEnd`'s doc comment.
- `packages/app/stories/design-system-inventory.ts` — the `drawer.tsx` entry.
- `packages/app/src/styles.css` — the `padding-inline-end` comment.
- `AGENTS.md` — the `ui` package bullet.
- `.scratch/command-dock/issues/10-decide-the-cards-surface.md` — the line that
  used to name `08` as the owner.

`08`'s own handoff table is left as history and points here for the decision.
