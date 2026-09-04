# Audit the canonical journey and its issue ownership

Status: resolved
Tags: wayfinder:task, release/v1
Parent: [Chart the V1 source release](../map.md)
Blocked by: [Reconcile the confirmed V1 release contract](09-reconcile-the-confirmed-v1-release-contract.md)
Assignee: unassigned

## Question

Audit the reconciled canonical journey against the current code, accepted ADRs,
V1 Definition of Done and all open release-tagged feature tickets. For each
journey capability, record what is built, what is partially built, what is
unbuilt, which named ticket owns it and where ownership is missing or
duplicated. Which concrete gaps must be decided before an End-to-end checkpoint
can be specified?

## Answer

### Audit basis

The matrix was audited on 1 September 2026 against the tree at that date, and
reconciled against the tree again on 4 September 2026. Every row and finding
below reads as of the reconciliation; where the two readings differ the later
one stands, and the changes are the Alias, Cards View and Layout rows, the
launch and multi-Space fixture rows, the architecture-issue and clean-clone
findings and the first, fourth and fifth decisions.

“Built” means the current source and executable tests expose the capability;
“partial” means a usable slice exists but not the release-contract form; and
“unbuilt” means the canonical journey cannot perform it. A resolved historical
ticket is evidence, not an owner for remaining work. The named owner below is
the open ticket that can close the gap.

| Canonical-journey capability | State | Current evidence | Remaining owner |
| --- | --- | --- | --- |
| Install and launch on the supported local stack | Partial | The pinned Node/pnpm toolchain, Docker PostgreSQL setup, HTTP host and CI PostgreSQL job exist. Startup still selects mutable Entry Space state and the README does not describe the final V1 journey. | `v1-release/01` replaces Entry startup; `v1-release/19` owns the clean-clone launch rehearsal and the setup-path defects it finds; `v1-release/07` owns final setup documentation and release proof. |
| Begin in the permanent Meta Space | Unbuilt | `src/startup/database-startup.ts`, `src/http/space-host.ts`, the repository interfaces and schema still use `entrySpaceId`/`spaces.entry`. | `space-cards/03` owns singleton aggregate state; `v1-release/01` owns Meta startup and retirement of Entry. Architecture issue `12` is resolved: the server-side repository now owns Meta lifecycle, so `v1-release/01` consumes that interface rather than deciding the boundary itself. |
| Receive deterministic Default Content only on first initialization | Unbuilt | Current startup creates the normal one-Card new Space and has no canonical initialized aggregate generator. | `v1-release/16`, after `v1-release/01` and `space-cards/01`; `alias-cards/06`, its third prerequisite, is complete. |
| Author Markdown Cards | Built | Markdown Opening, rendered reading, source editing, Save/Cancel, Title authoring, Move/Open/Close/Resize and HTTP persistence have production tests. | No feature owner remains; `v1-release/07` owns release evidence. |
| Author and open Alias Cards read-only | Built | Alias schema, creation, Target resolution and Title editing exist, and `alias-cards/06` has since landed ADR 0070: Opening an Alias resolves its immutable Target's Markdown read-only, with no Edit, Save, Cancel or Target picker, and Space Authoring refuses a changed Target while still accepting a rename. | No feature owner remains for Opening; `v1-release/03` owns the combined create/rename/delete surface. |
| Create, open, enter and switch among Space Cards | Partial | Schema, intake, serialization, projection and the Card front recognize `kind: 'space'`; direct/ancestor-cycle checks exist. The complete aggregate lifecycle, creation, in-place renderer and Open Spaces session behavior are absent. | `space-cards/03`, `space-cards/01`, `entity-url-addressability/07–08` and architecture issue `14`, which absorbed the superseded `space-cards/12` and still owns the undecided Open Spaces composition seam. |
| Add/remove Cards through the Cards View | Built | The production right drawer filters and alphabetizes absent Cards, supports pointer/keyboard Add and external drag/drop, and Remove from Layout removes membership plus incident Edges. `v1-release/02` has since closed its long, narrow, disabled, refused and persistence-failure application and Ladle evidence. | No feature owner remains; `v1-release/07` owns release evidence. |
| Create and manage Cards of all V1 kinds | Partial | Markdown and Alias creation plus shared Title editing exist; Space Card creation, kind-complete deletion and cascade confirmation do not. | `v1-release/03`, depending on `space-cards/03` and entity URLs. |
| Arrange Cards through Layouts | Built | Authored placement, Move, Open/Close/Resize and Layout-local state persist. The Layout-only decision landed as ADR 0079 (V1/20) and `layout-only-v1/01` has since landed the management surface: Add Layout creates and selects an empty Layout carrying one empty Active Graph, Layouts rename, select and delete through reload, the last Layout cannot be deleted, and deleting a Layout does not delete its Cards. | No management owner remains; `layout-only-v1/03` owns making a Layout the only canvas selection; `v1-release/04` is superseded, its conversion contract having been the thing ADR 0079 removed. |
| Arrange narratives through Graphs and Edges | Partial | Graph selection, multi-Graph rendering, Edge create/reconnect/delete, forks, merges, cycles, self-Edges and traversal exist. Graph create/rename/recolour/delete controls remain absent. | `v1-release/05`. |
| Save and reload authored work | Built for one Space; unbuilt for the aggregate | HTTP/PostgreSQL optimistic persistence and reload durability are built. There is no Meta-rooted aggregate commit or one-session-per-Space registry. | `space-cards/03`, and architecture issue `14` for the cross-Space half `space-cards/12` used to hold. Architecture issue `13` is resolved as a negative diagnostic: its differential test found the two adapters agreed, so no shared commit module was proposed and the seam is not a gap. |
| Recover from save failure and revision conflict | Built for one Space; partial across Spaces | Space Session and application tests keep the working Space visible through pending/failure, expose Retry, and support Accept remote/Resolve for conflicts. Switching or closing another live Space safely around those states is unbuilt. | Owned in halves: `v1-release/17` owns preserving the distinct structured refusal states, architecture issue `14` owns switching or closing another live Space safely around them, and `v1-release/07` owns final evidence for the already-built one-Space behavior. `space-cards/12` is superseded and owns none of it. |
| Present the Active Graph | Built within one Space | Start/exit, Advance, fork choice, Back, cycles, self-Edges, keyboard and pointer presentation behavior are covered. Cross-Space traversal is deliberately deferred. | No feature owner remains; `v1-release/07` owns release evidence. |
| Use durable product URLs | Partial | Space, current Space View, Card, Graph and single-Space presentation destinations, History behavior and HTTP 400/404 policy are built. Space Card authoring and Enter/Open remain open. ADR 0079 has since replaced the Space View URL model with a Layout-only one. | Tracked owners are `entity-url-addressability/07–08`, reconciled to Layout-only by V1/20; `layout-only-v1/03` owns retiring the Space View URL shape. |
| Export the complete authored result | Partial | Deterministic CLI export exists for one Space and tracks its exported revision. It does not write one Meta-rooted aggregate. | `v1-release/08`, which now also owns the Layout-only aggregate format criteria. Architecture issue `13` is resolved and overlaps nothing: its differential test proved the two adapters already agree, so the read/commit seam stays where it is. |
| Hard-reset to canonical Default Content | Unbuilt | No reset command or shared initialization/reset generator exists. | `v1-release/16`. |
| Import and recover the same authored result | Partial | Single-Space/directory import and destructive truncation exist, but not versioned `hyper.json` aggregate intake, exact Meta identity or complete cross-Space validation. | `v1-release/08`, which now also owns the Layout-only aggregate format criteria. |
| Exercise the multi-Space journey in development and Chromium | Unbuilt | The tracked fixture is not the complete Meta-rooted, converging multi-Space aggregate required to rehearse Open, Enter, switching, deletion and round trip through normal boundaries. | `space-cards/10`; ticket 11 decided this enabling fixture is checkpoint work rather than only later release proof, and `v1-release/19` carries it as a blocker. |
| Complete responsive and accessible product treatment | Partial | The shadcn/Base UI foundation, catalogue guardrails, major production surfaces and Ladle CI exist. Remaining feature surfaces have not received one final desktop/narrow-state pass. | `v1-release/06`, after the feature tickets it lists. |

### Ownership findings

- **Meta lifecycle was duplicated, and is now one owner.** This finding is
  closed. `space-cards/03` owned storage and aggregate invariants,
  `v1-release/01` owns application initialization/startup, and architecture issue
  `12` asked for a deep module spanning both. Issue `12` became that shared seam
  and is resolved: the server-side repository owns Meta lifecycle through
  `initializeAggregate`, `replaceAggregate` and an explicit
  `uninitialized | loaded` read, `lockRepositoryState` and `establishMetaSpace`
  are gone, and `importSpaces` survives only as a marked facade `v1-release/08`
  deletes. `v1-release/01` and `v1-release/08` consume that interface rather than
  restating persistence ordering, so the three contradictory implementations
  cannot occur.
- **Aggregate commit policy is duplicated and deliberately stays that way.** This
  finding is closed. `space-cards/03` owns the operation and `v1-release/08`
  consumes its complete read/import boundary; architecture issue `13` proposed
  concentrating the same semantics and is resolved as a **negative diagnostic**.
  Its differential test, `test/integration/aggregate-commit-differential.test.ts`,
  compares the memory and PostgreSQL commit results and resulting loaded
  aggregates across generated and mandatory cases, and the two adapters agreed
  throughout. No shared module was introduced, neither decision tree moved, and
  the ticket's direction-if-confirmed criteria stay deliberately unticked rather
  than claiming a refactor landed. Nothing is blocked on it; the locality
  improvement is reconsidered after V1.
- **Open Spaces composition is the one duplication still open.**
  `entity-url-addressability/08` owns Enter/open UI, and architecture issue `14`
  proposes the shared registry interface and has since absorbed the switching and
  closing persistence safety `space-cards/12` held, which is superseded. The
  interface owner must be selected before the remaining feature work proceeds
  independently.
- **Layout ownership is settled and inside the tracked release graph.** This
  finding is closed. The decision landed as ADR 0079 — not 0076, which the number
  had moved on to — through `v1-release/20`, which tracked `layout-only-v1/01–04`,
  folded the aggregate criteria into `v1-release/08`, reconciled the Definition of
  Done and the affected URL/Space Card tickets, and superseded `v1-release/04`
  along with the `create-a-layout-from-the-selected-computed-view` tracker.
  Add Layout has since been made empty and is built in `layout-only-v1/01`;
  the Computed View removal is not built and is `layout-only-v1/03`'s.
- **Clean-clone launch now has one implementation owner.** This finding is
  closed. `v1-release/07` could document and prove the supported
  install/Docker/startup path but owned no defect found while following it, so
  the End-to-end plan needed an explicit launch-rehearsal work package. Ticket 11
  named one: `v1-release/19` owns the clean-clone setup, the recorded rehearsal
  and the setup-path defects that rehearsal discovers, with `v1-release/07`
  behind it as the final release-proof owner.
- **Cards View evidence has caught up with its implementation.** This finding is
  closed. `v1-release/02`'s core workflow was already built and its
  long/narrow/disabled/refused/failure application and Ladle states have since
  been proved, so the ticket is complete and nothing schedules the Cards View
  again.
- Markdown authoring, single-Space persistence, presentation and most current URL
  behavior are built capabilities with no remaining feature ticket. This is not
  missing ownership: `v1-release/07` is their evidence owner.

### Decisions required before ticket 11 can specify End-to-end

1. **Choose the remaining shared module owner.** Two of the three are settled.
   Architecture issue 12 became the binding Meta lifecycle seam and is resolved,
   and issue 13 closed as a negative diagnostic that authorized no refactor, so
   the Meta and aggregate tickets consume settled interfaces. Only architecture
   issue 14 is open: triage it into the binding Open Spaces seam or close it as
   advice, then update the Open Spaces tickets' blockers accordingly.
2. **Settle and track the Layout-only proposal.** Done by `v1-release/20`: ADR
   0079 is accepted and indexed, `layout-only-v1/01–04` are tracked, and the
   Computed View/Space View requirements are retired from `v1-release/04`, the
   Definition of Done and the affected Space Card/URL tickets. Ticket 11's
   checkpoint now rests on committed ownership.
3. **Specify the destructive recovery step.** The canonical journey says
   “export; hard-reset; import,” but hard reset leaves a non-empty Default
   Content aggregate while ordinary import only initializes an empty repository.
   Decide explicitly that observed recovery uses
   `hyper <aggregate-path> --dangerous-truncate` after reset, or change the
   journey. A merge interpretation is forbidden by ADR 0077.
4. **Assign clean-clone launch rehearsal.** Done by ticket 11: `v1-release/19` is
   the work package that proves the documented Node/pnpm, Docker/PostgreSQL and
   Chromium stack from a clean clone before observed authoring begins, and it
   owns the setup-path defects that rehearsal finds.
5. **Place the multi-Space fixture.** Done by ticket 11: `space-cards/10` is
   required to make the End-to-end journey observable and repeatable rather than
   belonging only to final release proof, and it is an explicit checkpoint
   dependency `v1-release/19` carries. Whether to reopen that placement and drop
   the fixture from the critical path is a separate question, still open and not
   decided here.
6. **Choose the End-to-end cut line from this matrix.** Ticket 11 must say which
   partial capabilities are required for meaningful observed use. At minimum the
   journey cannot cross the checkpoint without Meta startup, Default Content,
   all three Card kinds, Layout/Graph authoring, aggregate persistence,
   presentation, complete export/reset/destructive-import recovery and enough
   product treatment to operate those paths accessibly. Final visual polish,
   exhaustive catalogue/release evidence and README/go-no-go work may remain
   between End-to-end and `v1.0.0`.
