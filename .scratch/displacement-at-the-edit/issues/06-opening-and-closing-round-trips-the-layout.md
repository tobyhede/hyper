# 06 — Opening and closing round-trips the Layout

Status: resolved
Blocked by: 02, 03

**What to build:** The property that makes the memoryless pair safe: Open then
Close, with nothing moved between, returns the Layout to the positions it started
from (ADR 0084).

**Why:** Close reclaims from where things are rather than from a record of who
was pushed. That is only defensible if the untouched case is exact — otherwise
repeated open/close drifts the Layout, which is the failure the derived model
could not have.

- [x] For an arbitrary Placement, an arbitrary member, and an arbitrary Open
      Size, Open-then-Close is the identity. Generated, not exampled.
- [x] The same for Open, resize any number of times, Close.
- [x] The drifting case is asserted as the *documented* behaviour rather than
      left implicit: a Card moved beyond the Open Card while it is open is
      reclaimed on Close although it was never pushed. ADR 0084 says this is
      deliberate, so a test says it too, and names the ADR.
- [x] Coverage counters where a generator could miss a branch, as
      `title.property.test.ts` does — and unlike it, seeded or built from a
      dedicated arbitrary so the counter cannot flake.

## Answer

`packages/app/test/displacement.property.test.ts`, driven through `SpaceAuthoring.complete`
against a real session rather than by calling `Placement.displace` — which is what makes it
evidence for tickets 02/03 rather than a second copy of ticket 01's Placement-level property.
The transform can be an exact involution and the Edits still drift, if an Open reads the
default Open Size while the Close reads the remembered one; that gap is what this covers.

Three properties: Open-then-Close is the identity over the whole positions record; Open,
any number of Resizes, Close is the identity, with the Close reclaiming the growth of the size
the Card was **last** Open at; and the drifting case asserted as documented behaviour, naming
ADR 0084 and the per-open-Card stored state it rejects. The third uses a dedicated arbitrary —
a witness placed strictly before the subject on both axes and dragged strictly beyond it
through the real `settled-card-movement` path — so "never pushed" and "reclaimed from" are
guaranteed by construction rather than being branches a generator might miss.

**Anti-flake: an explicit `seed: 84` and `numRuns: 200`.** A guaranteeing arbitrary would be a
different generator from the one the property runs under, so its counts would describe the
guarantee rather than the distribution actually checked. The counters are therefore a fixed
fact: 100 cases with a Card beyond the subject on `x` only, 106 on `y` only, 73 on both, 137 on
neither, 90 with the subject arriving Open against 110 Closed, all against a floor of 40.

Coordinates come from a small grid rather than a wide integer range, deliberately: the
comparison under test is **strict**, and two Cards level on an axis is the case a wide range
essentially never generates and the one that decides whether a Card moves at all.

**One finding.** The first formulation ran the pair from whichever state the subject was in,
so an already-Open subject was Closed first — which applies a *negative* growth first and
carries a Card less than one growth beyond the subject back across it, where the negation can
no longer find it. fast-check found it in nine cases. That is precisely the asymmetry ADR 0084
and `Placement.displace` state rather than clamp, so the fix was to Close an Open subject as
setup before measuring: the generator still produces Open subjects, and every measured
sequence is one the product can perform.
