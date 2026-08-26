# 01 — Remember Open Size after Close

**What to build:** Replace the coupled Expanded geometry with explicit Open or
Closed state and a remembered Open Size throughout the stored Space. An author
can resize a Card, Close it, reload the Space, and reopen it at the same size;
Cards never Opened acquire the concrete default Open Size on first Open. Closed
Size remains fixed domain policy and is not repeated in stored Placement data.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A Placement entry is a discriminated Open or Closed value: Open requires
      an Open Size, Closed may retain one, and Closed Size is structural rather
      than stored or optional document data.
- [ ] Open, Close, Resize, equality, conversion, displacement and effective-size
      derivation all speak the new model without a second compatibility path for
      the retired Expanded shape.
- [ ] First Open stores the concrete default Open Size; Close preserves it; an
      ordinary Resize changes it; reopening restores it.
- [ ] Every tracked seed, fixture, document example and test is rolled forward.
      Intake rejects the retired shape rather than normalizing it.
- [ ] The behavior survives the HTTP persistence boundary and browser reload,
      with focused unit and application evidence for never-opened, Open, and
      Closed-with-remembered-size Cards.
- [ ] Proposed ADR 0066 and the current glossary agree with the implemented
      model; do not accept the ADR yet while its resize interaction remains
      incomplete.
- [ ] `pnpm verify` and `pnpm e2e` pass, with the real output recorded.
