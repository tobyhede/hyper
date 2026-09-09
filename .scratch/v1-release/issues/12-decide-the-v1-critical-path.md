# Decide the V1 execution sequence and critical path

Status: resolved
Tags: wayfinder:grilling, release/v1
Parent: [Chart the V1 source release](../map.md)
Blocked by: [Define the End-to-end checkpoint](11-define-the-end-to-end-checkpoint.md)
Assignee: unassigned

## Question

Given the audited ownership and the settled End-to-end boundary, in what order
must the existing release and feature tickets be delivered to reach End-to-end
as soon as possible and then `v1.0.0` safely? Decide the dependency-critical
sequence, which work may proceed in parallel, and which oversized, duplicated or
stale tickets must be split, rewritten or retired before execution begins.

## Answer

PR 134 (`67ec0371`) has already delivered `space-cards/03`: aggregate intake,
`loadAggregate()`, unified `commit({ changes })`, repository Meta state,
coordinated sessions and the one-Space-Id session registry are foundations, not
future critical-subgraph work. The release graph starts by synchronizing with
that merge and must not split or reschedule its umbrella ticket.

### Dependency-critical sequence to End-to-end

`pnpm roadmap` derives the dependency graph from each implementation ticket's
`Blocked by` field. Use its release section for order and its ready list for
unblocked work whose triage state permits pickup. The critical subgraph uses
one unit per open ticket; it is a dependency-depth view, not an elapsed-time
estimate. Parallel work can still have blockers and is not automatically ready.

The earlier wave table mixed purposes with a second dependency graph and kept
calling completed work unbuilt. It is retired. The stages below describe the
obligations, not another schedule:

- **Foundation:** Layout-only canvas selection, Open Spaces composition, Space
  Card creation and embedded Opening, and Meta lifecycle are built. Their
  resolved issues remain evidence rather than tasks to schedule again.
- **Complete the authored aggregate:** durable Space Card selections precede
  their canonical round trip and linked fixture. Enter and independent-address
  integration use that fixture. Follow those issues' blockers rather than
  guessing the persisted selection shape in a downstream task.
- **Compose the command surfaces:** Dock promotion precedes the Card and Graph
  command work. Default Content/reset and refusal recovery keep their own
  dependencies; merely touching the same file does not join two obligations.
- **Reach End-to-end:** V1/19 owns the desktop clean-clone authoring and recovery
  rehearsal. Its blockers describe the checkpoint product, not the full V1
  surface. Graph management and final responsive treatment may finish outside
  that checkpoint's dependency chain, as ticket 11 explicitly permits.
- **Finish V1:** V1/07 joins the checkpoint, final product design, Graph
  management, refusal recovery and draft-discard acknowledgement before the
  full proof and human go/no-go.

The declaration in `.scratch/ROADMAP.md` selects the release tag and final gate.
It does not introduce a second list of blockers. Completed dependencies may
remain in issue history; the generator excludes them from the live graph.

### Ticket rewrites and retirements

- `space-cards/03` is resolved by PR 134. Its recorded Meta initializer gap is
  V1/01 work; deletion/lifetime integration is entity URL 07 work.
- Architecture issue 12 was the binding Meta lifecycle owner consumed by V1/01
  and V1/08, and it is resolved: the server-side repository owns Meta lifecycle
  through `initializeAggregate`, `replaceAggregate` and an explicit
  `uninitialized | loaded` read, and both tickets consume that interface.
- Architecture issue 13 was conditional and the condition did not fire. Its
  differential test, `test/integration/aggregate-commit-differential.test.ts`,
  found the memory and PostgreSQL adapters agree across every generated and
  mandatory case, so the pure commit refactor was **not** promoted into release
  work, the locality cleanup is deferred beyond V1 and the issue is resolved.
  Its direction-if-confirmed criteria stay deliberately unticked; nothing about
  it is built work to schedule.
- Architecture issue 14 is resolved: it absorbed `space-cards/12` and built
  Open Spaces. `space-cards/12` is superseded; integration uses the completed
  module rather than scheduling its implementation again.
- V1/02 was evidence-and-gap closure only over an already-built core Cards View
  workflow, and it is complete. Do not schedule the Cards View again.
- Entity URL 07 owns Space Card-specific creation and cascade semantics. V1/03
  owns only their unified cross-kind command surface.
- Layout-only ticket 05 is folded into V1/08, leaving one canonical
  aggregate-format and destructive-replacement owner. It is not a tracked ticket.
- Layout-only ticket 06's reconciliation is V1/20's own work rather than a
  tracked ticket, and it retired the stale V1/04 conversion contract:
  `layout-only-v1/01` now owns Layout management.
- Tickets 17 and 18 close PR 134's unowned correctness/evidence gaps; 18 is
  complete and 17 is open. Ticket 19 owns clean-clone setup, the compact proof
  matrix and checkpoint completion.
- Ticket 20 owns landing and reconciling the Layout-only prerequisite before
  downstream implementation proceeds. It is resolved. The remaining Layout-only implementation reaches V1/07
  and V1/19 through V1/08; V1/20 is no longer a live blocker.

The vocabulary above is settled but the filename is not: this ticket is still
`12-decide-the-v1-critical-path.md`, and its title and the `map.md` entry that
links it still say “critical path”. Renaming the file breaks that link, so
whether to rename it — and update `map.md` and V1/13 with it — is an open
decision rather than an edit this reconciliation may take.

### PR 134 follow-up disposition

Before End-to-end:

- V1/01 retires the divergent normal initializer while implementing canonical
  Meta initialization;
- entity URL 07 decides and proves deletion against an uncommitted sibling
  reference;
- ticket 17 preserves structured aggregate refusal identities and locations
  through session and UI state; and
- ticket 18 restores POST `/api/spaces` media/body/connection policy coverage —
  done.

Issue 13's differential test was diagnostic and mandatory, and it has run: the
adapters agreed, so it authorized no work. The unlocked ordinary commit and
unlocked aggregate-read optimizations remain beyond V1 unless measurement shows
they block the checkpoint.

### From End-to-end to `v1.0.0`

After `v1-release/13`'s feedback rule has classified observed results, complete
Graph management, responsive/design-system polish,
exhaustive Ladle/application parity, README and Definition-of-Done mapping, then
apply the release proof and go/no-go contract. Layout management is already
built and needs final proof rather than another implementation. Only an accepted
canonical-journey correction may change this path; non-blocking requests remain
beyond V1.
