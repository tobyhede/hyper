# Two refinement links point only one way

Status: ready-for-agent

Surfaced by: review of PR #39

## Context

A status block is only navigable if both ends agree. The repository already
holds that: a scan of all 42 ADRs finds the `Refines`/`Refined by` graph
symmetric except for two pairs, both predating PR #39.

```
0007 Refines 0003, but 0003 does not list 0007 under "Refined by"
0016 Refines 0010, but 0010 does not list 0016 under "Refined by"
```

PR #39 added three more of these and fixed all three before merging, which is
how these two came to light. They were left alone as out of scope for that PR.

The consequence is small but real, and it is the one the status block exists to
prevent: a reader landing on 0003 or 0010 has no forward pointer to the decision
that refined it. There is no ADR index in `docs/adr/` to land on instead.

## Direction

Add `0007` to ADR 0003's `Refined by:` and `0016` to ADR 0010's. Status-block
edits only — ADR 0041 rules that accepted bodies stay historical, and the status
block is the sanctioned place for a later decision to announce itself.

Note that ADR 0003's `Refined by:` already reads `0012, 0032, 0040, 0041`, so
this appends to an existing line rather than adding one.

## Worth considering

The scan that found this was a throwaway. If the refinement graph is worth
keeping symmetric, it is worth a test in the idiom
`test/unit/conflict-markers.test.ts` already establishes — one pass over
`docs/adr/*.md` parsing the status blocks and asserting both directions agree.
That would also catch the `Supersedes`/`Superseded by` case in issue `04`.

Two spellings must be tolerated: `Status: superseded` with a separate
`Superseded by:` line, and `Status: superseded by ADR NNNN` inline. Both are in
the tree, and a scan that knows only the first reports 0019 and 0029 as gaps
when they are not.

## Acceptance

- 0003 and 0010 name their refiners.
- A status-block scan reports no `Refines`/`Refined by` asymmetry.
- A decision recorded on whether the scan becomes a test.
