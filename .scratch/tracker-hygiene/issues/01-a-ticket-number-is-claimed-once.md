# 01 — A ticket number is claimed once, and something says so

Status: ready-for-agent
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
  `16-retire-the-registry-drawer-and-the-yielded-strip`
- `design-system-baseline` — `05-handoff-regression-2026-08-21` and
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

- [ ] A test reports two ticket files claiming one number within an effort, and
      names both files
- [ ] It fails when a duplicate is planted and passes when it is removed —
      demonstrated, not asserted
- [ ] The four live pairs are resolved, each by a decision recorded in the ticket
      (renumbered with citations followed, or deliberately left with the
      collision noted in both files)
- [ ] `pnpm verify` green
