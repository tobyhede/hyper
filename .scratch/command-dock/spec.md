# Command Dock

Replace the Space Sidebar with a command surface that floats over the canvas
instead of taking width from it.

**The decision is recorded and the shape is not.** [ADR 0082](../../docs/adr/0082-the-space-command-surface-is-bound-by-what-it-owes-not-where-it-sits.md)
supersedes ADR 0053, binds six behavioural obligations, and deliberately leaves
edge, gesture, resting positions, grouping, icons, colour and the product name
to stories and behaviour tests. Read it before any ticket here: several tickets
exist only because the prototype fails an obligation, and several findings that
looked like defects are explicitly *not* bound and were dropped.

One clause of it is read wrongly often enough to be worth flagging here: the
Dock's toolbar strip carries no resting persistence cue, and that retires **a
permanent slot in the bar, not the reporting**. `failed`, `rejected` and
`conflicted` still report unasked, through the standing `PersistenceNotice`, the
portalled `AlertDialog`s and a dot on the switcher row naming which Space is
unwell. `01` is where that was settled and why.

The prototype was `packages/app/stories/review/command-dock.stories.tsx` with a
React-free model and its own sheet beside it. **`07` moved it** — to
`stories/space/`, flipped stable rather than deleted — and mounted the
production Dock in the same change; `06`'s own work was the sheet and
`parent-space-mark` deletions and the `prefers-reduced-motion` guard. The model
and the sheet now live in production at `packages/app/src/dock-model.ts` and
`packages/app/src/components/command-dock.css`, and node-testable Dock behaviour
is under `packages/app/test/dock-*.test.ts`. **Tickets 01–06 are prototype
history**: read them for the reasoning behind a decision, not for where the
code is.

**This effort predates ADR 0085.** Tickets written before it say Layout for
Diagram and Card for Thing, and the table below quotes each file's own heading
rather than correcting it. `13`, `14` and `15` carry a note giving the current
names, because each is open and written throughout in the retired ones; `16`,
`17` and `18` were written after the rename and need none. The resolved records
keep Card and Layout as provenance, which is what ADR 0085 asks for.

## Tickets

| # | | Status |
| --- | --- | --- |
| [01](issues/01-settle-the-three-open-decision-sheets.md) | Settle the three open decision sheets | resolved |
| [02](issues/02-obey-the-adrs-the-prototype-cites.md) | Obey the ADRs the prototype cites | resolved |
| [03](issues/03-upstream-the-fixes-owed-to-project-ui.md) | Upstream the fixes owed to `@project/ui` | resolved |
| [04](issues/04-make-the-prototype-seams-promotable.md) | Make the prototype's seams promotable | resolved |
| [05](issues/05-give-the-navigation-path-a-home.md) | Wire the Dock to the Exit that already exists | resolved |
| [06](issues/06-retire-the-prototype-scaffolding.md) | Retire the prototype scaffolding | resolved |
| [07](issues/07-promote-the-dock-and-retire-the-space-sidebar.md) | Promote the Dock and retire the Space Sidebar | resolved |
| [08](issues/08-retire-the-sidebar-era-primitives.md) | Retire the Sidebar-era primitives | resolved |
| [09](issues/09-rename-a-space-as-a-real-edit.md) | Rename a Space as a real Edit | resolved |
| [10](issues/10-decide-the-cards-surface.md) | Decide the Cards surface: popover or drawer | resolved |
| [11](issues/11-restore-card-and-dock-behaviour-with-trustworthy-evidence.md) | Restore Card and Dock behaviour with trustworthy application evidence | resolved |
| [12](issues/12-align-card-toolbars-with-the-command-dock.md) | Align Card hover toolbars with the Command Dock through shared components | resolved |
| [13](issues/13-settle-new-layout-and-new-space-command-outcomes.md) | Settle New Layout and New Space command outcomes | needs-triage |
| [14](issues/14-audit-canvas-decoration-invalidation-and-active-graph-consistency.md) | Audit canvas decoration invalidation and Active Graph consistency | ready-for-agent |
| [15](issues/15-settle-the-open-disclosure-treatment.md) | Settle the open-disclosure treatment, which now reaches every ghost trigger | needs-triage |
| [16](issues/16-retire-the-registry-drawer-and-the-yielded-strip.md) | Retire the registry Drawer and the strip the shell yields to it | needs-triage |
| [17](issues/17-decide-the-button-label-variant.md) | Decide `Button`'s `label` variant, which has no consumer | needs-triage |
| [18](issues/18-reproduce-the-name-click-that-opens-a-thing.md) | Reproduce the Diagram/Graph name click that opens a Thing | needs-info |

## Where it stands

**The Dock is built and the Sidebar is gone.** `07` merged as `36165cf7`,
discharging ADR 0082's supersession of ADR 0053 in the application rather than
on paper; `08` took the primitives that stood only beside the Sidebar, `10`
replaced the screen-edge Things drawer with a Popover anchored to the Dock's own
trigger, `12` gave the Thing rail the Dock's neutral surface, and `09` made the
Space name a real Edit rather than a label with nothing behind it.

**What is left is four decisions, one audit and one thing nobody can reproduce**,
none of them blocking each other:

- **13** and **15** are `needs-triage` because the work is small either way and
  the decision is the whole of it — what New Diagram and New Space should
  actually do, and whether a `ghost` disclosure trigger reading as open is an
  application-wide rule or a Dock treatment that reached too far.
- **16** and **17** are the same shape and exist for the same reason: an
  unconsumed thing whose retirement is a `@project/ui` decision, left in the
  tail of a resolved ticket where nothing can scan for it. `16` holds the
  registry `Drawer`, `DRAWER_WIDTH` and `AppShell`'s `insetEnd`, with five
  sites pointing at it; `17` holds `Button`'s `label` variant, which `09` left
  behind. They were briefly one file and are two, because `16`'s argument is
  about a vendored component drifting from an upstream and a CVA variant
  neither drifts nor regenerates.
- **14** is the one `ready-for-agent` ticket. Two of the three findings `07`'s
  review carried into it have since been fixed elsewhere and are struck; what
  survives is the Active Graph fallback feeding the Dock's commands and the
  decoration memo whose dependency list is incomplete.
- **18** is `needs-info` and is the one thing here waiting on a person rather
  than a decision: the reported Diagram/Graph name click that also Opens a
  Thing. `11` could not reproduce it across the gestures it tried and ruled out
  the standing hypothesis, so there is no work to pick up until someone
  obtains it — but it is a file rather than a sentence, because a report in a
  resolved ticket's prose is invisible to every scan the repo runs.

`11` itself resolved with its repair, which merged inside `07`.

The React Compiler question the prototype raised is **not** here — it is repo-wide
and lives at [`react-compiler/01`](../react-compiler/issues/01-decide-whether-to-enable-the-react-compiler.md).

## Evidence

Anything reaching `packages/ui` owes `pnpm e2e:ladle`, which neither `verify`
nor `e2e` runs and which is its own CI job. Anything reaching a stable story
owes ADR 0052's two proofs. A change that stays out of `packages/ui` and out of
the application owes `pnpm verify` and nothing else — say which commands you
judged inapplicable and why.
