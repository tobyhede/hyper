# 01 — A ticket number is claimed once, and something says so

Status: resolved
Blocked by: nothing.

**What to build:** two tickets cannot share a number in the same effort without
something reporting it, and the four pairs that already do are resolved.

## Why, from the case that happened

`13` added `docs/adr/0088-creating-a-thing-completes-on-activation.md` while
`docs/adr/0088-aggregate-names-the-meta-rooted-collection.md` already held that
number. `pnpm verify` stayed green and `test/unit/adr-status-blocks.test.ts`
reported 25 passing, because `readAdrs()` keys a `Map` by the four-digit number:
two files claiming one number is not an error to that shape, it is a key written
twice, and the second silently replaced the first. Every reciprocity check in
that file then ran against one of the two ADRs, and the other's `Related:` line
stopped being checked by anything at all.

`b8de678b` renumbered the ADR to 0089 and gave that test a duplicate-number arm
that reads the numbers as a list before anything collapses them.

**The tracker the ADRs are planned in has the same fault and no guard.** Four
pairs are live right now:

- `architecture-review` — `16-move-registry-coordination-tests-to-persistence`
  and `16-navigation-answers-its-own-address`
- `architecture-review` — `17-collapse-card-creation` and
  `17-the-browser-location-is-one-module`
- `command-dock` — `16-create-thing-is-three-peers` and
  `22-retire-the-registry-drawer-and-the-yielded-strip`
- `design-system-baseline` — `handoff-regression-2026-08-21` and
  `05-make-the-production-canvas-card-a-design-system-component`

This is not cosmetic. `.scratch` tickets reference each other by number — `16`
is cited from `13`'s own body, and `AGENTS.md` cites `.scratch` issues by number
throughout — so a number naming two files makes a citation ambiguous to a reader
and to an agent following it.

## What resolving them means

Renumbering is not free: a number is an address other files have already used.
Each pair needs the survivor chosen deliberately and every citation of the moved
ticket followed, the way `b8de678b` followed `ADR 0088` across twenty-three
files before renumbering. Some of these efforts are finished, so the cheaper
answer for a closed pair may be to record the collision in both files rather
than renumber a history nobody will navigate again — that call belongs in this
ticket, made per pair and written down.

- [x] A test reports two ticket files claiming one number within an effort, and
      names both files — `test/unit/scratch-ticket-numbers.test.ts`, one case per
      effort so a failure names the effort as well as the two files
- [x] It fails when a duplicate is planted and passes when it is removed —
      demonstrated twice: the scan reported all four live pairs before they were
      resolved, and a planted pair is asserted against directly in the last case
- [x] The four live pairs are resolved, each by a decision recorded in the ticket
- [x] `pnpm verify` green

## How each pair was resolved

Renumbering, in all four, rather than recording the collision and leaving it. The
alternative the ticket left open would have meant an allowlist in the guard, and a
guard with an exemption list reports what someone remembered to leave out of it.

**The rule, where both members were cited: the number stays where more of the tree
still navigates by it**, because that is the choice that moves the fewest citations
and therefore risks the fewest missed ones. It is not a rule about seniority, and
it went both ways.

- `architecture-review` — `16` stays with
  `16-move-registry-coordination-tests-to-persistence`, which `14` cites twice as
  its own deferred tail. `16-navigation-answers-its-own-address` → `22`; its one
  citation, from `17-the-browser-location-is-one-module`, followed.
- `architecture-review` — `17` stays with `17-the-browser-location-is-one-module`,
  which `18` and `19` cite ten times between them. `17-collapse-card-creation` →
  `23`; both citations, in `v1-release/03`, followed.
- `command-dock` — `16` stays with `16-create-thing-is-three-peers`, cited bare
  from `13`. `16-retire-the-registry-drawer-and-the-yielded-strip` → `22`; every
  citation of it names the file rather than the number, and all six were followed
  (`AGENTS.md`, `packages/ui/src/AppShell.tsx`,
  `packages/app/stories/design-system-inventory.ts`, `command-dock/08`,
  `command-dock/10`, `command-dock/spec.md`).
- `design-system-baseline` — not a renumber. `05-handoff-regression-2026-08-21` is
  a handoff *about* issue `05`, not a second issue `05`, so it lost the prefix
  rather than taking a free number: `handoff-regression-2026-08-21.md`. The number
  stays with `05-make-the-production-canvas-card-a-design-system-component`, and
  both citations were followed. The guard reads `<NN>-<slug>.md`, so an unnumbered
  document in an `issues/` directory is outside it — which is the right answer for
  a file that was never claiming an address.
