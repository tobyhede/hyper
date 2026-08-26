# 01 — Remember Open Size after Close

**What to build:** Replace the coupled Expanded geometry with explicit Open or
Closed state and a remembered Open Size throughout the stored Space. An author
can resize a Card, Close it, reload the Space, and reopen it at the same size;
Cards never Opened acquire the concrete default Open Size on first Open. Closed
Size remains fixed domain policy and is not repeated in stored Placement data.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] A Placement entry is discriminated by `open`: Open requires an Open Size,
      Closed may retain one, and Closed Size is structural rather than stored
      or optional document data.
- [x] Open, Close, Resize, equality, conversion, displacement and effective-size
      derivation all speak the new model without a second compatibility path for
      the retired Expanded shape.
- [x] First Open stores the concrete default Open Size; Close preserves it; an
      ordinary Resize changes it; reopening restores it.
- [x] Every tracked seed, fixture, document example and test is rolled forward.
      Intake rejects the retired shape rather than normalizing it.
- [x] The behavior survives the HTTP persistence boundary and browser reload,
      with focused unit and application evidence for never-opened, Open, and
      Closed-with-remembered-size Cards.
- [x] Proposed ADR 0066 and the current glossary agree with the implemented
      model; do not accept the ADR yet while its resize interaction remains
      incomplete.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with the real output
      recorded.

## Answer

Resolved by PR #121 (`8496f50`) as part of the integrated Open Card model. The
stored representation is a discriminated union on the boolean `open` field:
Open entries require `openSize`, Closed entries may retain it, and Closed Size
remains fixed domain policy. First Open records `DEFAULT_OPEN_SIZE`; Close
changes only `open` and therefore preserves the remembered size; reopening
restores it. This is the shipped equivalent of the ticket's earlier phrase
"explicit Open or Closed state" and deliberately does not revive the discarded
`state: 'open' | 'closed'` spelling from the superseded implementation branch.

Evidence lives at the public seams: schema and intake tests hold the two stored
variants; Placement tests hold effective geometry and displacement; Space
Authoring tests exercise Resize, Close and reopen; and the browser editing test
proves the remembered rect survives the HTTP boundary and reload.

Recorded PR #121 verification: `pnpm verify` passed; `pnpm e2e` — 112 passed;
`pnpm e2e:ladle` — 47 passed.
