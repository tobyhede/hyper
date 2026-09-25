# 30 — Test a `map-not-found` refusal on Delete Map

**What to build:** A test for the one remaining route to a Delete Map refusal: a Delete whose Map is gone by the time the press lands refuses `map-not-found`. The shell draws the refusal in its standing notice, and an effect clears it once the reader has left that Map. Nothing tests that effect.

**Blocked by:** None.

**Status:** needs-triage

**Priority:** P3

**Why:** `SpaceApp.test.tsx` carried a note recording this gap until ticket 29's sweep removed it as a negative result in source. The rule sends such a result to a ticket, and this is that ticket. The other route to a Delete Map refusal, Delete on the last Map, is withheld by the Command Dock before the press (ADR 0079). So the race cannot be staged from a mount, and it probably needs an integration or e2e run that removes the Map between the menu opening and the press.

- [ ] A test stages a Delete Map whose Map is already gone, and asserts the `map-not-found` refusal is shown
- [ ] The same test asserts the notice clears once the reader is on another Map
