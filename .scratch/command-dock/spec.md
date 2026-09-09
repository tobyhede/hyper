# Command Dock

Replace the Space Sidebar with a command surface that floats over the canvas
instead of taking width from it.

**The decision is recorded and the shape is not.** [ADR 0082](../../docs/adr/0082-the-space-command-surface-is-bound-by-what-it-owes-not-where-it-sits.md)
supersedes ADR 0053, binds six behavioural obligations, and deliberately leaves
edge, gesture, resting positions, grouping, icons, colour and the product name
to stories and behaviour tests. Read it before any ticket here: several tickets
exist only because the prototype fails an obligation, and several findings that
looked like defects are explicitly *not* bound and were dropped.

The prototype is `packages/app/stories/review/command-dock.stories.tsx` with its
React-free model in `dock-model.ts` and its own sheet in `command-dock.css`.
Node-testable behaviour is under `packages/app/test/dock-*.test.ts`. None of it
is production: a plain `.ts` under `stories/` is invisible to both halves of the
ADR 0052 ratchet, which is why the model lives there.

## Tickets

| # | | Status |
| --- | --- | --- |
| [01](issues/01-settle-the-three-open-decision-sheets.md) | Settle the three open decision sheets | resolved |
| [02](issues/02-obey-the-adrs-the-prototype-cites.md) | Obey the ADRs the prototype cites | resolved |
| [03](issues/03-upstream-the-fixes-owed-to-project-ui.md) | Upstream the fixes owed to `@project/ui` | resolved |
| [04](issues/04-make-the-prototype-seams-promotable.md) | Make the prototype's seams promotable | resolved |
| [05](issues/05-give-the-navigation-path-a-home.md) | Wire the Dock to the Exit that already exists | resolved |
| [06](issues/06-retire-the-prototype-scaffolding.md) | Retire the prototype scaffolding | ready-for-human |
| [07](issues/07-promote-the-dock-and-retire-the-space-sidebar.md) | Promote the Dock and retire the Space Sidebar | ready-for-agent |

01 gated the component and is settled: the trail is the parent step and a
switcher, the switcher draws indent guides and no glyph, and the Dock's toolbar
strip carries no resting persistence cue — `failed`, `rejected` and `conflicted`
still report unasked, through the standing `PersistenceNotice`, the portalled
`AlertDialog`s and a dot on the switcher row naming which Space is unwell, which
is what ADR 0082 binds. Read that clause with its scope: it retires a permanent
slot in the bar, not the reporting. The reasoning is in that ticket, which is where it has
to be — the three sheets that held it are `06`'s to delete. 02, 03 and 04 ran in
parallel against the prototype as it stands. 06 is last of the prototype work by
construction, and 07 is what the other six are preparation for — it mounts the
Dock, deletes `SpaceSidebar`, and is the only ticket here that discharges ADR
0082's supersession of ADR 0053 in the application rather than on paper.

The critical path is now **07**. 06's deletions and its `prefers-reduced-motion`
guard are done, and all four sheets are gone; the one thing left in it is the
palette fork, which waits on the app's `:root` going light — a change with no
ticket anywhere in `.scratch/`. 03 closed with `ParentIcon`, its last item,
which had been waiting on a name for the mark rather than on any work.

The React Compiler question the prototype raised is **not** here — it is repo-wide
and lives at [`react-compiler/01`](../react-compiler/issues/01-decide-whether-to-enable-the-react-compiler.md).

## Evidence

Anything reaching `packages/ui` owes `pnpm e2e:ladle`, which neither `verify` nor
`e2e` runs and which is its own CI job — and that is true of a prototype change
too, so reaching `packages/ui` outranks being prototype-only. Anything reaching a
stable story owes ADR 0052's two proofs. A prototype-only change that stays out
of `packages/ui` owes `pnpm verify` and nothing else — say which commands you
judged inapplicable and why.
