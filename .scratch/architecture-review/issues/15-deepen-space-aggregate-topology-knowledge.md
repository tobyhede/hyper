# Deepen Space aggregate topology knowledge

Status: needs-triage
Tags: Improvement
Blocked by: `space-cards/03` — Build the Space Card lifecycle and aggregate persistence

Surfaced by: the 31 August 2026 Space Cards architecture review, candidate
“Deepen Space aggregate topology knowledge”. The review classed this candidate
as speculative.

## The possible deepening

Complete aggregate intake already traverses every Space Card reference to
validate targets, convergence, cycles and reachability. Space Card deletion
then reconstructs snapshots and inbound reference counts outside that module to
calculate the zero-reference cascade. Export and deletion confirmation may need
the same topology facts later.

That repetition may mean the existing `SpaceAggregate` interface is too
shallow: it exposes validated Spaces and `lookup.space`, then makes consumers
rebuild knowledge intake has just established.

## Do not build this yet

Today the deletion lifecycle is the only demonstrated consumer. One consumer
does not justify a new seam, and exposing raw inbound-count maps would enlarge
the interface without hiding a domain operation.

Revisit when `v1-release/08` export or Card-deletion confirmation needs the same
facts. If a second consumer appears, deepen the existing aggregate module—do
not create a parallel topology module. Prefer domain-shaped queries such as a
validated deletion closure over exposing graph bookkeeping for callers to
interpret.

ADR 0074 remains the constraint: shared Space Card ownership is decided by
reference counting, cycles are refused, Meta is the sole unreferenced Space,
and no mark-and-sweep reachability collector is introduced.

## Questions for triage

- Does complete export need topology beyond `aggregate.spaces` and
  `lookup.space`?
- Does destructive confirmation need the exact deletion closure before the
  lifecycle completes it?
- Can the lifecycle consume one domain-shaped aggregate operation and delete
  its private inbound-count reconstruction?
- Can that operation remain pure and tested through `SpaceAggregate` intake?

## Acceptance if promoted

- [ ] At least two production consumers need the same topology knowledge.
- [ ] The capability deepens `SpaceAggregate`; no sibling topology seam or
      caller-owned raw graph is added.
- [ ] Reference counting and convergent ownership remain exactly ADR 0074's;
      no mark-and-sweep behavior appears.
- [ ] Tests cross aggregate intake and the new interface rather than testing an
      exported internal traversal helper.
