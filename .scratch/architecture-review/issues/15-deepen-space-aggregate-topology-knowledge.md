# Deepen Space aggregate topology knowledge

Status: needs-triage
Tags: Improvement
Blocked by: none

Surfaced by: the 31 August 2026 Space Cards architecture review, candidate
“Deepen Space aggregate topology knowledge”. The review classed this candidate
as speculative. The 21 September audit keeps it deferred: do not promote it to
implementation without the evidence below.

## The possible deepening

Complete aggregate intake validates Space Resource targets, selections, cycles
and rooting. Space Resource deletion separately calculates the zero-reference
cascade. A future operation needing the same deletion closure might justify
concentrating that knowledge inside the existing aggregate module.

The current `SpaceAggregate` interface is not shown to be shallow. It already
hides substantial validation behind intake, validated Spaces and `lookup.space`.
Intake's `referencedSpaceIds` is a set, not inbound reference counts or a deletion
closure (`packages/graph/src/space-aggregate.ts`). The lifecycle would be moving
knowledge into that module, not merely exposing an answer intake already holds.

## Do not build this yet

The deletion lifecycle remains the only demonstrated closure consumer.

- `space-cards/03` is resolved, so it is no longer a blocker.
- `v1-release/08` is resolved. Export enumerates the loaded snapshots and verifies
  staged bytes through ordinary intake; it needs no deletion topology
  (`src/export/export-aggregate.ts`).
- Deletion confirmation exists, but holds a pending Resource and calls the
  lifecycle after confirmation. It does not preview a closure
  (`packages/app/src/resource-deletion.ts`).

Revisit when an exact cascade preview or another production operation needs the
same closure. The two-consumer requirement below is this ticket's promotion
gate, not a claim that every pure module needs two callers or two adapters.
Exposing raw inbound-count maps would enlarge the interface without hiding a
domain operation. If justified, deepen the existing aggregate module rather
than adding a parallel topology seam.

The deletion test supports waiting: deleting intake would spread substantial
validation across callers, while moving the current cascade unchanged would
relocate complexity without demonstrated leverage for another caller.

## Constraints a future deepening must preserve

- **Reference counting, not mark-and-sweep.** ADR 0074 permits convergent
  ownership, refuses cycles and protects Meta. A target survives while another
  Space Resource still references it.
- **The planning view is part of the operation.** The lifecycle counts stored
  snapshots with the containing Space replaced by its edited working snapshot
  (`packages/persistence/src/session-registry.ts`, the `spaceResourceEdges` and
  `edgesById` construction in `delete`). ADR 0097 requires this view rather than
  all live working Spaces or the original stored topology.
- **The intermediate candidate is not a valid aggregate yet.** Removing the
  last reference leaves the targets unreferenced until the cascade removes
  them. Requiring successful strict intake of that intermediate state would
  reject the deletion it is meant to derive.
- **Baseline forgiveness must survive.** `decideCommit` records
  `baselineUnreferenced` from failed baseline intake and permits those existing
  unreferenced Spaces to remain. Requiring a branded `SpaceAggregate` before
  planning needs an explicit account of that supported behavior; do not silently
  narrow the lifecycle's inputs.
- **Coordination remains with the lifecycle.** ADR 0099 waits only for commits
  already in flight and checks failed/conflicted recovery dependencies against
  both stored and working snapshots. A pure closure query cannot replace those
  checks, expected revisions, or atomic installation and commit.

## Questions for the next triage

- Which second production consumer actually needs the exact deletion closure?
- Can one domain-shaped operation hide the counting and traversal without
  exposing caller-owned graph bookkeeping?
- How does that operation preserve the stored-plus-edited-source planning view,
  temporary zero-reference state and baseline forgiveness?
- Does the new interface improve locality and leverage enough to justify its
  input contract, rather than merely moving the existing loop?

## Acceptance if promoted

- [ ] At least two production consumers need the same deletion knowledge.
- [ ] The capability deepens the existing aggregate module; no sibling topology
      seam or caller-owned raw graph is added.
- [ ] Reference counting and convergent ownership remain exactly ADR 0074's;
      no mark-and-sweep behavior appears.
- [ ] Planning preserves ADRs 0097 and 0099, temporary zero-reference candidates
      and `decideCommit`'s baseline forgiveness.
- [ ] Pure behavior is tested through the new domain interface using intake
      where applicable, without requiring invalid intermediate candidates to
      pass strict intake or exporting an internal traversal helper for tests.
- [ ] Lifecycle tests remain: they prove revision coordination, recovery and
      atomic effects that pure aggregate tests cannot replace.

## Comments

### Audit, 21 September 2026

Recommendation: keep deferred. Export and confirmation now exist without
supplying the hoped-for second consumer. Removed the resolved blocker and
replaced the assumption that intake already knows the closure with the actual
set-versus-count distinction and planning constraints.

Observed: **77 tests passed across 3 files**:

```sh
pnpm exec vitest run packages/graph/test/space-aggregate.test.ts packages/persistence/test/space-resource-lifecycle.test.ts packages/persistence/test/session-registry.test.ts
```

This was an audit of existing behavior, not an implementation of this ticket.
