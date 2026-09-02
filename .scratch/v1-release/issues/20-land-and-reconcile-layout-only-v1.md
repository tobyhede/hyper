# 20 — Land and reconcile Layout-only V1

Status: resolved
Tags: release/v1
Blocked by: none

**What to build:** Make the already-decided Layout-only V1 prerequisite durable
before downstream release implementation begins. Land the Layout-only decision
and its surviving implementation tickets 01–04 as tracked work, then reconcile
every release contract that consumes them.

- [x] The accepted Layout-only decision and reciprocal ADR relationships are
      committed and indexed.
- [x] Layout-only implementation tickets 01–04 are tracked with executable
      blockers and ownership.
- [x] The aggregate criteria formerly proposed as Layout-only ticket 05 are
      folded into [V1/08](08-round-trip-multi-space-import-and-export.md).
- [x] The reconciliation work formerly proposed as Layout-only ticket 06 updates
      the Definition of Done, agent guidance, Space Card and URL tickets.
- [x] Superseded Computed View/Space View implementation tickets are resolved or
      retired; downstream V1 guidance names only Layout and Graph selections.
- [x] V1/07, V1/19 and the critical path link this ticket as their one durable
      Layout-only prerequisite.

This ticket owns landing and reconciliation only. The Layout-only implementation
tickets own their domain and application changes; V1/08 remains the aggregate
round-trip owner.

## What landed

**The decision.** ADR 0079 — *V1 exposes only Layouts, and first open
initializes one* — is accepted and listed in `docs/adr/README.md`. It supersedes
ADR 0031, 0045, 0072 and 0075, which moved to `docs/adr/superseded/` with
reciprocal `Superseded by: 0079` lines, and it refines ADR 0014, 0053, 0064,
0068 and 0069, each of which answers with `Refined by: … 0079`. The proposal was
drafted against ADR number 0076, which the tree had since spent; 0079 is the
same decision at its landed number.

**The tickets.** `layout-only-v1/01–04` are tracked, in an acyclic chain each
ticket can execute: `01` Add Layout, `02` first-working-load initialization
(blocked by `01`), `03` the Computed View and Space View removal (blocked by
`02`), and `04` Space Cards selecting initialized Layouts (blocked by `02`, `03`,
`space-cards/03` and `space-cards/01`). Each names what it owns and what it
leaves to a neighbour. `01`–`03` are critical-path Wave 0; `04` waits on
`space-cards/01`, so V1/12 places it in Wave 3 and `entity-url-addressability/07`
waits on `03` rather than on `04` — pointing it at `04` would close a cycle
through `space-cards/01`.

**Ticket 05.** Folded into V1/08, which gained the `defaultLayout`, layoutless
source-state, identity-preservation and post-initialization Export criteria and
the `layout-only-v1/03` and `layout-only-v1/04` blockers with them. It is not a
tracked ticket.

**Ticket 06.** Its reconciliation half is this ticket's own work: the Definition
of Done, `AGENTS.md`, the scoped `docs/agents/*.md` guidance, the Space Card
tickets and the URL tickets. Its proof half belongs to the implementation
tickets and to V1/07. It is not a tracked ticket either.

**Retirements.** `v1-release/04` is superseded — ADR 0079 removed the Computed
View it converted from — and `layout-only-v1/01` owns Layout management in its
place. Both tickets under
`.scratch/create-a-layout-from-the-selected-computed-view/` are superseded by
ADR 0079: the first by `layout-only-v1/01`, the second by `layout-only-v1/03`,
which removes Computed Views outright rather than holding them read-only.

## What this deliberately did not do

The code is unchanged. `AGENTS.md` and the scoped `docs/agents/*.md` files
describe what is **built**, so each now carries ADR 0079 as *decided, not built*
above descriptions that still, accurately, describe Computed Views,
`defaultRenderer` and the Create Layout conversion. `CONTEXT.md`, the root
`README.md`, `packages/app/README.md` and those long-form guidance bodies are
retired by `layout-only-v1/03` in the commit that changes the code they
describe, not before — rewriting them here would have made them lie about the
tree.
