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
future critical-path work. The release graph starts by synchronizing with that
merge and must not split or reschedule its umbrella ticket.

### Dependency-critical sequence to End-to-end

| Wave | Must complete | Parallel work available in the wave |
| --- | --- | --- |
| 0 — Settle the model | Landed by V1/20: ADR 0079 is accepted and indexed, `layout-only-v1/01–04` are tracked, ticket 05's aggregate criteria live in V1/08, and the Definition of Done, guidance, Space Card and URL tickets are reconciled with the superseded entries retired. Build `layout-only-v1/01`, `02` and `03` in that order. `layout-only-v1/04` is **not** Wave 0 work: it waits on `space-cards/01`, so it joins Wave 3. | None of the downstream V1 work may author the retired Computed View/Space View contract. |
| 1 — Resolve shared seams | Build architecture issue 12's Meta lifecycle; run issue 13's differential test and refactor only if it proves drift; build issue 14's Open Spaces module over PR 134's registry. | `alias-cards/06`, V1/02 evidence closure, ticket 17 structured refusals and ticket 18 HTTP wire-policy proof proceed independently. |
| 2 — Complete aggregate-facing capabilities | Build Meta initialization/startup in V1/01, the aggregate import/export format in V1/08, and Space Card creation/reference/lifetime authoring in entity URL 07. | These three lanes consume the settled seams and may run together once their individual blockers clear. **V1/08 starts here but closes in Wave 3**: it blocks on `layout-only-v1/04`, which owns the Space Card's selected-Layout content the round trip must preserve. Build everything in V1/08 that does not depend on that shape, and do not guess it. |
| 3 — Join Spaces into the application | Build in-place Space Card Opening (`space-cards/01`), then Space Cards selecting initialized Layouts (`layout-only-v1/04`), the tracked multi-Space fixture (`space-cards/10`), then Enter/independent opening and History through Open Spaces (`entity-url-addressability/08`). Close V1/08 once `layout-only-v1/04` lands. | In-place Opening and fixture work may overlap after their dependencies; `layout-only-v1/04` follows in-place Opening; Enter integration waits for both plus issue 14. |
| 4 — Compose the checkpoint product | Rewrite V1/03 as the unified Card-kind command surface and integrate Default Content/reset in V1/16. | The command surface can compose completed feature operations while Default Content integrates the completed Markdown, Alias and Space renderers. |
| 5 — Complete End-to-end | Close required desktop accessibility/evidence gaps and run ticket 19's clean-clone rehearsal with its compact proof matrix. | Only proof repair and qualifying checkpoint-defect fixes remain; the successful rehearsal completes the untagged checkpoint. |

The critical spine is Layout-only → shared seams → Meta/aggregate/lifetime →
Opening/Open Spaces/fixture → Default Content and unified controls → rehearsal.
Alias Opening, Cards View evidence, refusal feedback and HTTP proof are parallel
lanes that must rejoin before checkpoint integration.

### Ticket rewrites and retirements

- `space-cards/03` is resolved by PR 134. Its recorded Meta initializer gap is
  V1/01 work; deletion/lifetime integration is entity URL 07 work.
- Architecture issue 12 is the binding Meta lifecycle owner consumed by V1/01
  and V1/08.
- Architecture issue 13 is conditional: a failing differential test promotes
  the pure commit refactor into release work; a passing test resolves the issue
  and defers locality cleanup.
- Architecture issue 14 absorbs `space-cards/12` and becomes the binding Open
  Spaces implementation. `space-cards/12` is superseded.
- V1/02 is evidence-and-gap closure only; its core Cards View workflow is built.
- Entity URL 07 owns Space Card-specific creation and cascade semantics. V1/03
  owns only their unified cross-kind command surface.
- Layout-only ticket 05 is folded into V1/08, leaving one canonical
  aggregate-format and destructive-replacement owner. It is not a tracked ticket.
- Layout-only ticket 06's reconciliation is V1/20's own work rather than a
  tracked ticket, and it retired the stale V1/04 conversion contract:
  `layout-only-v1/01` now owns Layout management.
- Tickets 17 and 18 close PR 134's unowned correctness/evidence gaps. Ticket 19
  owns clean-clone setup, the compact proof matrix and checkpoint completion.
- Ticket 20 owns landing and reconciling the Layout-only prerequisite before
  downstream implementation proceeds. It is the one durable link the critical
  path, V1/07 and V1/19 name for that prerequisite; they do not enumerate the
  `layout-only-v1` tickets, which reach them through V1/08.

### PR 134 follow-up disposition

Before End-to-end:

- V1/01 retires the divergent normal initializer while implementing canonical
  Meta initialization;
- entity URL 07 decides and proves deletion against an uncommitted sibling
  reference;
- ticket 17 preserves structured aggregate refusal identities and locations
  through session and UI state; and
- ticket 18 restores POST `/api/spaces` media/body/connection policy coverage.

Issue 13's differential test is diagnostic but mandatory. The unlocked ordinary
commit and unlocked aggregate-read optimizations remain beyond V1 unless
measurement shows they block the checkpoint.

### From End-to-end to `v1.0.0`

After `v1-release/13`'s feedback rule has classified observed results, complete full
Layout management, Graph management, responsive/design-system polish,
exhaustive Ladle/application parity, README and Definition-of-Done mapping, then
apply the release proof and go/no-go contract. Only an accepted
canonical-journey correction may change this path; non-blocking requests remain
beyond V1.
