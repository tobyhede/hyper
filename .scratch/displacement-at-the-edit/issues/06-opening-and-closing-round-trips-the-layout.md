# 06 — Opening and closing round-trips the Layout

Status: ready-for-agent
Blocked by: 02, 03

**What to build:** The property that makes the memoryless pair safe: Open then
Close, with nothing moved between, returns the Layout to the positions it started
from (ADR 0084).

**Why:** Close reclaims from where things are rather than from a record of who
was pushed. That is only defensible if the untouched case is exact — otherwise
repeated open/close drifts the Layout, which is the failure the derived model
could not have.

- [ ] For an arbitrary Placement, an arbitrary member, and an arbitrary Open
      Size, Open-then-Close is the identity. Generated, not exampled.
- [ ] The same for Open, resize any number of times, Close.
- [ ] The drifting case is asserted as the *documented* behaviour rather than
      left implicit: a Card moved beyond the Open Card while it is open is
      reclaimed on Close although it was never pushed. ADR 0084 says this is
      deliberate, so a test says it too, and names the ADR.
- [ ] Coverage counters where a generator could miss a branch, as
      `title.property.test.ts` does — and unlike it, seeded or built from a
      dedicated arbitrary so the counter cannot flake.
