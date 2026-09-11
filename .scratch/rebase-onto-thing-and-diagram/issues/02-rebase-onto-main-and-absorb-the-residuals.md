# 02: Rebase onto `origin/main` and absorb the upstream residuals

**What to build:** the branch sits on current `origin/main` with its work intact — a Card's commands drawn on the Command Dock's own surface, and the Things list restored as a Popover with a counted filter — and the places where main genuinely changed rather than merely renamed are reconciled rather than reverted.

After ticket 01 the conflict set is no longer thirty mechanical paths. What remains is six files carrying real upstream change, plus a small number of structural decisions where the branch deleted something main renamed.

The real upstream residuals, largest first: the shared application host reworking the app root; the `@project/ui` barrel, which lost the Sidebar block, the Tabs primitives, the add-Thing control and the `OpenSpaces` component (its status label now living in a module of its own) and which must gain this branch's command-surface, choice-menu and toggle-group exports; the Command Dock itself; the canvas Thing; the drawer this branch supersedes; and the Thing rail's actions. None is large. All are judgement rather than transcription.

Two structural decisions the rebase forces:

The drawer. Main renamed it and changed it slightly; this branch deletes it in favour of the Popover. The deletion stands — that is what the branch is for — but read main's change to it before discarding it and say whether any of it belongs in the Popover. The drawer's test, story, catalogue spec, design-system inventory entry and parity claims go with it.

The rail. Main renamed the rail module and its stylesheet; this branch rewrote both. Rename detection may not pair them, which leaves both spellings in the tree. One survives, and it is main's path.

The branch consumes none of the primitives main deleted — confirm that rather than trusting it, and if a consumer has appeared, it is a signal to reconsider the deletion's replacement rather than to restore the primitive.

**Blocked by:** 01 — Replay the ADR 0085 vocabulary rename across the branch's own history.

**Status:** resolved

- [ ] The branch is rebased onto `origin/main` with its two commits intact and legible. Their messages are rewritten into the current vocabulary.
- [ ] Every upstream residual is absorbed, not reverted. For each of the six files, say in the pull request what main changed and what the resolution kept.
- [ ] The drawer and everything that proved it are gone; the Popover and everything that proves it are present, including its catalogue spec, its story, its unit test and its inventory and parity entries.
- [ ] Exactly one spelling of the rail module and its stylesheet exists in the tree, and it is main's.
- [ ] The vocabulary guard passes. It scans every tracked file for the retired shapes in identifier, kebab-case, stylesheet-class and test-id form, and it — not the compiler — is what reports a spelling the replay missed. Run `pnpm test` before the rest of the bar for that reason.
- [ ] `pnpm verify` is green.
- [ ] `pnpm e2e` and `pnpm e2e:ladle` are green.
- [ ] The database-backed end-to-end project is considered. It lives outside the application's own specs, drives the same chrome, and nothing in the normal bar observes it — so if this rebase moved what the chrome draws, it is checked here with the database up and stopped afterwards. If it was judged inapplicable, say why.

---

## What the rebase found

`git rebase --onto origin/main d6670664` — the synthetic renamed base from 01, not the original merge base. Three commits, all three intact, messages rewritten into the current vocabulary through the same mask-rewrite-unmask shape the rename scripts use, with the one `.scratch/` citation in them protected (issue 12's filename still carries the retired word, because the sweep does not rewrite that tree).

**Ticket 01's decision paid.** Thirty conflicted paths became nine, across all three commits: `AGENTS.md`, `packages/ui/src/CanvasThing.tsx`, `packages/ui/src/index.ts`, `packages/app/src/components/CommandDock.tsx`, `packages/app/src/components/ThingsDrawer.tsx` (modify/delete), `packages/app/stories/design-system-inventory.ts`, `packages/app/stories/support/CommandDockFixture.tsx`, `docs/agents/rendering.md` and `.scratch/command-dock/issues/08`. The Thing rail's actions — named in this ticket as a residual — auto-merged with no conflict, because 01 had already given both sides main's spelling of the module and its stylesheet.

**The rail question was moot for the same reason.** Main renamed the rail to `ThingRail.tsx`/`thing-rail.css`; the replay produced those exact paths, so rename detection never had to pair anything. Exactly one spelling is in the tree and it is main's.

### What main changed, and what each resolution kept

- **`packages/app/stories/support/CommandDockFixture.tsx` — the shared application host.** Main replaced the whole hand-rolled fixture with `Application resolve={() => openDockStory(scenario)}`. Resolution takes main's file whole. The branch's contribution to the old fixture is not lost but obviated: main's fixture draws production, so the Dock it renders is the branch's Dock with the branch's Things list, for free.
- **`packages/ui/src/index.ts` — the barrel.** Main deleted the `Tabs` export with `components/tabs.tsx`. Resolution drops that line and keeps the branch's `ToggleGroup`. `CommandSurface`, `CommandToolbar`, `CommandName` and `ChoiceMenu` landed with the first commit and are all present. **No consumer of any primitive main deleted** — the only live reference was the barrel line itself; every other hit across `packages`, `test` and `scripts` is prose in a comment recalling the retired surface.
- **`packages/app/src/components/CommandDock.tsx`.** Both sides moved one comment: the branch renamed the surface (`The surface` → `The list`, the drawer having become a Popover), main renamed the generic word in prose (`no one thing` → `no one entity`, `ffb3d3d2`). Resolution keeps both.
- **`packages/ui/src/CanvasThing.tsx` — the canvas Thing.** The conflict is inside the Space Thing selector's doc comment: main's copy restates the empty-list rule that the branch's own version carries below it, in wording the branch supersedes (the branch replaced `Select` with `ChoiceMenu`, so `nokey` is on "the trigger and the popup" rather than "both halves"). Resolution keeps the branch's paragraph and drops main's duplicate — then separately absorbs main's generic-word change into the surviving sentence: *an ordinary **entity** to reference*.
- **`packages/app/src/components/ThingsDrawer.tsx` — the drawer.** Main's only change since the base is a doc paragraph noting that ADR 0082 retired the Sidebar and issue 08 deleted the primitive, so the alternative the paragraph argues against no longer exists. **None of it belongs in the Popover**: it argues Drawer-over-Sidebar, and `ThingsPopover` already carries the three-surface comparison that chose the Popover over both. The deletion stands. Its test, story, catalogue spec, inventory entry and parity claims went with it; the Popover's five files and its inventory and parity entries are all present.
- **`packages/app/stories/design-system-inventory.ts`.** Main deleted the entries for the seven modules issue 08 took. Resolution takes main's list and adds one entry back — `packages/ui/src/components/drawer.tsx`, which **this branch orphans**: issue 08 ran while `ThingsDrawer` was still its consumer, so it did not take it. `pnpm ui:catalog:check` is green.
- **`AGENTS.md` and `docs/agents/rendering.md`.** Main's text, per ticket 03, which owns writing the branch's contribution back into it. Three `AGENTS.md` bullets (`react-flow-adapter`, `ui`, `app`) and three `rendering.md` bullets were rewritten wholesale on both sides. Taking main's is what brings in the elkjs removal (ADR 0086) and the `layout-resolution.ts` → `diagram-resolution.ts` prose the rename scripts could not produce.
- **`.scratch/command-dock/issues/08`.** Main closed the record ("all six modules are deleted"); the branch had appended a section proposing the drawer and `AppShell`'s `insetEnd` be retired with them. Resolution keeps main's closed record and adds a section saying the two were live when 08 ran, so they are a later decision rather than an omission — with the same correction made to the stale handoff comment in `packages/app/src/styles.css`.

### Verification

Run on the finished tree: `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm ui:catalog:check`, `pnpm lint` (no suppressions pruned), `pnpm format:check`, `pnpm test` — all green, 197 files / 2470 passed. **The vocabulary guard passes**, which is the check that reports a spelling the replay missed.

`pnpm e2e` and `pnpm e2e:ladle` were **not** run here — left to CI on the owner's instruction. `pnpm e2e:postgres` was also not run: this rebase does move what the chrome draws, so it is in scope, but it needs a running PostgreSQL and CI runs it as the last step of the `postgres` job against a database that job has already migrated.

**One claim in a commit body is now stale and was deliberately left standing.** `feat(ui): restore the Things list as a Popover` ends with `pnpm verify: green. pnpm e2e: 183 passed. pnpm e2e:ladle: 86 passed.` — true of the commit as authored, against the pre-rebase tree. Rewriting it would be rewriting someone's record of what they ran; the pull request states the verification that actually covers this tree.
