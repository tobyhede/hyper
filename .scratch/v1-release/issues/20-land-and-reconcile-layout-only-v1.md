# 20 — Land and reconcile Layout-only V1

Status: ready-for-agent
Tags: release/v1
Blocked by: none

**What to build:** Make the already-decided Layout-only V1 prerequisite durable
before downstream release implementation begins. Land the Layout-only decision
and its surviving implementation tickets 01–04 as tracked work, then reconcile
every release contract that consumes them.

- [ ] The accepted Layout-only decision and reciprocal ADR relationships are
      committed and indexed.
- [ ] Layout-only implementation tickets 01–04 are tracked with executable
      blockers and ownership.
- [ ] The aggregate criteria formerly proposed as Layout-only ticket 05 are
      folded into [V1/08](08-round-trip-multi-space-import-and-export.md).
- [ ] The reconciliation work formerly proposed as Layout-only ticket 06 updates
      the Definition of Done, agent guidance, Space Card and URL tickets.
- [ ] Superseded Computed View/Space View implementation tickets are resolved or
      retired; downstream V1 guidance names only Layout and Graph selections.
- [ ] V1/07, V1/19 and the critical path link this ticket as their one durable
      Layout-only prerequisite.

This ticket owns landing and reconciliation only. The Layout-only implementation
tickets own their domain and application changes; V1/08 remains the aggregate
round-trip owner.
