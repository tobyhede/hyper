# Two refinement links point only one way

Status: resolved

Surfaced by: review of PR #39

## Context

A status block is only navigable if both ends agree. The repository already
holds that: a scan of all 42 ADRs finds the `Refines`/`Refined by` graph
symmetric except for two pairs, both predating PR #39.

```text
0007 Refines 0003, but 0003 does not list 0007 under "Refined by"
0016 Refines 0010, but 0010 does not list 0016 under "Refined by"
```

PR #39 repaired two further asymmetries that PR #36 had introduced with ADRs
0040 and 0041 — `0030 Refined by: 0040` and `0033 Refined by: 0040`, neither
answered by 0040's `Refines:` line — which is how these two came to light. They
were left alone as out of scope for that PR.

The consequence is small but real, and it is the one the status block exists to
prevent: a reader landing on 0003 or 0010 has no forward pointer to the decision
that refined it. There is no ADR index in `docs/adr/` to land on instead.

## Resolution

**0003 now names 0007.** Its `Refined by:` reads `0007, 0012, 0032, 0040, 0041`.
Status-block edit only — ADR 0041 rules that accepted bodies stay historical,
and the status block is the sanctioned place for a later decision to announce
itself.

**0010 deliberately does not name 0016, and the guard exempts it.** ADR 0016 is
`Status: rejected` — the tree's only rejected ADR. Its claims never took effect,
so it has nothing to announce on the ADR it proposed to refine, and a forward
pointer would send a reader from a live decision to a discarded one. The part of
0016 that survived is carried by ADR 0019, which 0010 already names. No status
block in the tree points at a rejected ADR, and this does not become the first.

**The scan became a test.** `test/unit/adr-status-blocks.test.ts`, in the idiom
`conflict-markers.test.ts` established: one pass over `docs/adr/*.md`, parsing
the status blocks and asserting both directions agree. The open question in the
original "Worth considering" section is answered yes.

Four spellings it has to tolerate, all present in the tree:

- `Status: superseded` with a separate `Superseded by:` line, and
  `Status: superseded by ADR NNNN` inline. A scan that knows only the first
  reports 0019 and 0029 as gaps when they are not.
- `Supersedes: none` (ADR 0007, the only one), which must resolve to nothing
  rather than to an ADR.
- `Partly carried by:` (ADR 0016, the only one), which is not a refinement and
  must not be read as one, or 0019 would be reported as owing an answer.

**Supersession reciprocity is deliberately not asserted.** Whether an ADR
retired in two stages names one superseder or both is the open convention
question in issue `04`, and a guard that forced either answer would decide it by
accident. The parser already reads both supersession spellings, so adding the
assertion is a one-line change once that decision lands. The one asymmetry it
would report today is `0040 Supersedes 0022` against `0022 Superseded by: 0026`
— exactly issue `04`'s subject.

**`Related:` is not asserted either, and is not a defect.** It is asymmetric in
37 places at present. PR #39 moved 0033 from 0040's `Related:` into its
`Refines:`, which is evidence the two fields are not interchangeable; whether
`Related` is meant to be reciprocal at all is a separate question nobody has
asked.

## Acceptance

- [x] 0003 names its refiner.
- [x] A status-block scan reports no `Refines`/`Refined by` asymmetry.
- [x] A decision recorded on whether the scan becomes a test.
