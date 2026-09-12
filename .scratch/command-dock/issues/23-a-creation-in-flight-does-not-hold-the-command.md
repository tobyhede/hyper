# 23 — A creation in flight does not hold the command it was pressed on

Status: needs-triage
Tags: release/v1
Blocked by: nothing. `19` threaded the created Thing's id through this same
window and deliberately left the rest of it open.

**What to decide:** what the Create cluster does while a Space Thing creation is
still in flight. Today it does nothing at all, and `19` closed only the half of
that which was a wrong answer rather than a missing one.

## The window, and what is left in it

`createSpaceThing` awaits a two-snapshot coordinated Edit. Nothing raises
`createDisabled` meanwhile — it is `!availability.addThing`, which answers
presenting, content editing and chrome renaming, not re-entrancy — so a second
press lands inside the window. `19` made each press continue at the Thing *it*
made. Two things it did not touch, both reachable by pressing Create Space Thing
twice quickly:

- **Both Spaces are called `Space 1`.** The title is minted at the press, from
  the containing Space's own Thing titles (`nextSpaceTitle`), and neither press
  has installed anything by the time the second one reads them. So the
  repository gains two distinct Spaces with one name, and two Things with one
  name pointing at them.
- **Both Things are placed at the same point.** `centreAnchor()` is read at the
  press too, so the second Thing lands exactly on the first.
- **The caret moves out of the first Thing's Title editor.** The second press's
  continuation replaces the first's, which is correct for "the press that opened
  the window owns it" taken one press at a time, and is still an author typing a
  name into a field that goes away under them.

`packages/app/test/space-thing-authoring.test.tsx` already documents the first
of these in passing — its two-press case says the titles collide and asserts by
id for exactly that reason — so the behaviour is pinned but not decided.

**Add Thing cannot produce any of this**, its Edit being synchronous, which is
why this is a question about the asynchronous creation rather than about Create.

## What the decision is between

Roughly: withdraw the cluster for the duration of a creation (a fourth reason a
Create control can be unavailable, which `createDisabled` currently has no room
for); or let the presses through and make the *derivations* late rather than
eager — mint the title and read the anchor inside the Edit, where the first
creation is already installed. The second keeps the surface live and is the
larger change, because both values are the surface's today.

- [ ] The decision is recorded here
- [ ] Two presses into one window produce two distinguishable Things, or one
- [ ] `pnpm verify` and `pnpm e2e` green
