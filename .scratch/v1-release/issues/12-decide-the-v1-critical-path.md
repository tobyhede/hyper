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

`pnpm roadmap` computes the dependency graph and the critical subgraph from the
tickets' own `Blocked by` fields, and it is the authority for order and for what
is currently unblocked. Read its output rather than any prose copy of the graph:
this table says what each wave is **for** and which tickets remain open in it,
and deliberately does not restate the edges the tool derives. A wave says what
its work is **for**, not what is pickable today: several tickets in later waves
have no unmet blockers now, and the tool's ready list is what says so.

| Wave | Must complete | Parallel work available in the wave |
| --- | --- | --- |
| 0 — Settle the model | Landed by V1/20: ADR 0079 is accepted and indexed, `layout-only-v1/01–04` are tracked, ticket 05's aggregate criteria live in V1/08, and the Definition of Done, guidance, Space Card and URL tickets are reconciled with the superseded entries retired. `layout-only-v1/01` and `02` have since been built, so `layout-only-v1/03` — making a Layout the only V1 canvas selection — is all that remains here. It has no unmet blocker, which is what makes it the pickable head of the wave. `layout-only-v1/04` is **not** Wave 0 work: it waits on `space-cards/01`, so it joins Wave 3. | None of the downstream V1 work may author the retired Computed View/Space View contract. |
| 1 — Resolve the shared seam and Space Card reference authoring | Build architecture issue 14's Open Spaces module over PR 134's registry. Architecture issue 12 is resolved — the server-side repository now owns Meta lifecycle — and issue 13's differential test ran and found the two adapters agree, so no refactor is scheduled and neither gates anything. Space Card creation, reference and lifetime authoring in entity URL 07 belongs here rather than Wave 0: its one open blocker is `layout-only-v1/03`, which is Wave 0 work. | Ticket 17's structured aggregate refusals proceed independently. `alias-cards/06`, V1/02's evidence closure and ticket 18's HTTP wire-policy proof are complete. |
| 2 — Complete aggregate-facing capabilities | Build Meta initialization/startup in V1/01 and the aggregate import/export format in V1/08. | These two are not parallel with each other: V1/08 is blocked by V1/01. **V1/08 starts here and closes in Wave 3**, because it also blocks on `layout-only-v1/04`, which owns the Space Card's selected-Layout content the round trip must preserve. Build everything in V1/08 that does not depend on that shape, and do not guess it. |
| 3 — Join Spaces into the application | One chain, in this order: in-place Space Card Opening (`space-cards/01`), then Space Cards selecting initialized Layouts (`layout-only-v1/04`), then closing V1/08, then the tracked multi-Space fixture (`space-cards/10`), then Enter/independent opening and History through Open Spaces (`entity-url-addressability/08`). | Nothing in this wave is parallel with anything else in it. The fixture is **not** available alongside in-place Opening: `space-cards/10` is blocked by V1/08, which is blocked by `layout-only-v1/04`, which is blocked by `space-cards/01`. Enter integration waits for that whole chain plus architecture issue 14. |
| 4 — Compose the checkpoint product | Rewrite V1/03 as the unified Card-kind command surface and integrate Default Content/reset in V1/16. | The command surface can compose completed feature operations while Default Content integrates the completed Markdown, Alias and Space renderers. |
| 5 — Complete End-to-end | Close required desktop accessibility/evidence gaps and run ticket 19's clean-clone rehearsal with its compact proof matrix. | Only proof repair and qualifying checkpoint-defect fixes remain; the successful rehearsal completes the untagged checkpoint. |

`pnpm roadmap` prints the critical subgraph and the parallel work beside it.
This ticket deliberately names neither list: a restated one goes stale the day a
`Blocked by` field changes, and the prose copies that did restate it are what
this reconciliation removed.

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
- Architecture issue 14 absorbs `space-cards/12` and becomes the binding Open
  Spaces implementation. `space-cards/12` is superseded.
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
  downstream implementation proceeds. It is the one durable link the critical
  subgraph, V1/07 and V1/19 name for that prerequisite; they do not enumerate
  the `layout-only-v1` tickets, which reach them through V1/08.

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

After `v1-release/13`'s feedback rule has classified observed results, complete full
Layout management, Graph management, responsive/design-system polish,
exhaustive Ladle/application parity, README and Definition-of-Done mapping, then
apply the release proof and go/no-go contract. Only an accepted
canonical-journey correction may change this path; non-blocking requests remain
beyond V1.
