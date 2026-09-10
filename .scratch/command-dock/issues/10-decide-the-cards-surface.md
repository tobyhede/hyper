# 10 — Decide the Cards surface: popover or drawer

Status: needs-triage
Tags: release/v1
Blocked by: nothing. `07` is what left the two designs standing side by side.

**What to decide:** Whether the Dock's Cards cluster keeps opening `CardsDrawer`,
or draws the Cards list itself as a popover — and then retire whichever loses.

This is **the one part of the prototype that did not survive promotion**, and it
did not survive for a reason rather than by oversight. The prototype's Cards
cluster discloses a popover it draws itself, chosen over "a Drawer from the screen
edge" in a comparison recorded at the top of the prototype sheet. Production has
`CardsDrawer`: an evidenced surface with seven parity claims, its own stable story
sheet, its own Ladle spec and its own unit tests. Shipping both would be the
"second place commands live" that ADR 0082 rules out, and retiring an evidenced
production surface is a second promotion rather than a side effect of the first —
so `07` wired the Dock's Cards cluster to open the drawer and did not ship the
prototype's list.

**What the decision has to weigh.**

- The drawer takes layout space from the canvas while it is open (`AppShell`'s
  `insetEnd`, `DRAWER_WIDTH`). ADR 0082 binds the *command surface* to take none;
  the drawer is a surface the author opens and closes rather than furniture on
  every screen, which is the distinction `AppShell` records. Is that distinction
  the right one, or is it the loophole ADR 0082 meant to close?
- A popover follows the Dock to any of its twelve slots, which the drawer cannot;
  the drawer holds many more rows legibly than a popover does, and the Cards
  collection is the surface that reveals Cards a sparse Layout does not place
  (ADR 0040, ADR 0069) — so it is a *list of everything*, which is the case a
  popover is worst at.
- Whichever goes takes its parity claims, its stories and its tests with it.

## Acceptance

- [ ] The decision recorded, with the comparison, wherever a treatment decision
      belongs — the prototype sheet's own comparison is the starting point.
- [ ] The losing surface deleted, its parity claims retired and its inventory
      entry with them.
- [ ] The winner's claims cover what the loser's covered, so the count of things
      proved does not fall.

## Comments

**Raised by `07`'s "Found while building it".** Recorded there as "it wants its
own ticket too" and tracked nowhere, which is what a status scan misses
(`docs/agents/issue-tracker.md`). This is that ticket.
