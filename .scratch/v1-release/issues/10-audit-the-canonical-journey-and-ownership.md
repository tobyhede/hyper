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

“Built” means the current source and executable tests expose the capability;
“partial” means a usable slice exists but not the release-contract form; and
“unbuilt” means the canonical journey cannot perform it. A resolved historical
ticket is evidence, not an owner for remaining work. The named owner below is
the open ticket that can close the gap.

| Canonical-journey capability | State | Current evidence | Remaining owner |
| --- | --- | --- | --- |
| Install and launch on the supported local stack | Partial | The pinned Node/pnpm toolchain, Docker PostgreSQL setup, HTTP host and CI PostgreSQL job exist. Startup still selects mutable Entry Space state and the README does not describe the final V1 journey. | `v1-release/01` replaces Entry startup; `v1-release/07` owns final setup documentation and release proof. No separate implementation ticket owns a clean-clone launch rehearsal. |
| Begin in the permanent Meta Space | Unbuilt | `src/startup/database-startup.ts`, `src/http/space-host.ts`, the repository interfaces and schema still use `entrySpaceId`/`spaces.entry`. | `space-cards/03` owns singleton aggregate state; `v1-release/01` owns Meta startup and retirement of Entry. Architecture issue `12` duplicates the undecided module boundary. |
| Receive deterministic Default Content only on first initialization | Unbuilt | Current startup creates the normal one-Card new Space and has no canonical initialized aggregate generator. | `v1-release/16`, after `v1-release/01`, `space-cards/01` and `alias-cards/06`. |
| Author Markdown Cards | Built | Markdown Opening, rendered reading, source editing, Save/Cancel, Title authoring, Move/Open/Close/Resize and HTTP persistence have production tests. | No feature owner remains; `v1-release/07` owns release evidence. |
| Author and open Alias Cards read-only | Partial | Alias schema, creation, Target resolution, Title editing and current metadata authoring exist. Open still exposes superseded retarget/metadata behavior instead of immutable read-only Target content. | `alias-cards/06`; `v1-release/03` owns the combined create/rename/delete surface. |
| Create, open, enter and switch among Space Cards | Partial | Schema, intake, serialization, projection and the Card front recognize `kind: 'space'`; direct/ancestor-cycle checks exist. The complete aggregate lifecycle, creation, in-place renderer and Open Spaces session behavior are absent. | `space-cards/03`, `space-cards/01`, `entity-url-addressability/07–08` and `space-cards/12`. Architecture issue `14` duplicates the undecided Open Spaces composition seam. |
| Add/remove Cards through the Cards View | Partial | The production right drawer filters and alphabetizes absent Cards, supports pointer/keyboard Add and external drag/drop, and Remove from Layout removes membership plus incident Edges. Core component, operation and canvas tests pass; the ticket's long, narrow, disabled, refused and persistence-failure application/Ladle evidence is incomplete. | `v1-release/02` owns the remaining evidence and any behavior it exposes as missing. |
| Create and manage Cards of all V1 kinds | Partial | Markdown and Alias creation plus shared Title editing exist; Space Card creation, kind-complete deletion and cascade confirmation do not. | `v1-release/03`, depending on `space-cards/03` and entity URLs. |
| Arrange Cards through Layouts | Partial | Authored placement, Move, Open/Close/Resize and Layout-local state persist. The application does not expose complete Add/Rename/Select/Delete management. The Layout-only decision has since landed as ADR 0079 (V1/20), so ownership is durable. | `layout-only-v1/01` owns Add Layout and the management surface; `v1-release/04` is superseded, its conversion contract having been the thing ADR 0079 removed. |
| Arrange narratives through Graphs and Edges | Partial | Graph selection, multi-Graph rendering, Edge create/reconnect/delete, forks, merges, cycles, self-Edges and traversal exist. Graph create/rename/recolour/delete controls remain absent. | `v1-release/05`. |
| Save and reload authored work | Built for one Space; unbuilt for the aggregate | HTTP/PostgreSQL optimistic persistence and reload durability are built. There is no Meta-rooted aggregate commit or one-session-per-Space registry. | `space-cards/03` and `space-cards/12`; architecture issue `13` duplicates the undecided aggregate-commit policy seam. |
| Recover from save failure and revision conflict | Built for one Space; partial across Spaces | Space Session and application tests keep the working Space visible through pending/failure, expose Retry, and support Accept remote/Resolve for conflicts. Switching or closing another live Space safely around those states is unbuilt. | `space-cards/12` owns cross-Space persistence safety; `v1-release/07` owns final evidence for the already-built one-Space behavior. |
| Present the Active Graph | Built within one Space | Start/exit, Advance, fork choice, Back, cycles, self-Edges, keyboard and pointer presentation behavior are covered. Cross-Space traversal is deliberately deferred. | No feature owner remains; `v1-release/07` owns release evidence. |
| Use durable product URLs | Partial | Space, current Space View, Card, Graph and single-Space presentation destinations, History behavior and HTTP 400/404 policy are built. Space Card authoring and Enter/Open remain open. ADR 0079 has since replaced the Space View URL model with a Layout-only one. | Tracked owners are `entity-url-addressability/07–08`, reconciled to Layout-only by V1/20; `layout-only-v1/03` owns retiring the Space View URL shape. |
| Export the complete authored result | Partial | Deterministic CLI export exists for one Space and tracks its exported revision. It does not write one Meta-rooted aggregate. | `v1-release/08`, which now also owns the Layout-only aggregate format criteria. Architecture issue `13` overlaps the aggregate read/commit seam. |
| Hard-reset to canonical Default Content | Unbuilt | No reset command or shared initialization/reset generator exists. | `v1-release/16`. |
| Import and recover the same authored result | Partial | Single-Space/directory import and destructive truncation exist, but not versioned `hyper.json` aggregate intake, exact Meta identity or complete cross-Space validation. | `v1-release/08`, which now also owns the Layout-only aggregate format criteria. |
| Exercise the multi-Space journey in development and Chromium | Unbuilt | The tracked fixture is not the complete Meta-rooted, converging multi-Space aggregate required to rehearse Open, Enter, switching, deletion and round trip through normal boundaries. | `space-cards/10`; ticket 11 must decide whether this enabling fixture is part of the End-to-end checkpoint or only later release proof. |
| Complete responsive and accessible product treatment | Partial | The shadcn/Base UI foundation, catalogue guardrails, major production surfaces and Ladle CI exist. Remaining feature surfaces have not received one final desktop/narrow-state pass. | `v1-release/06`, after the feature tickets it lists. |

### Ownership findings

- **Meta lifecycle is duplicated, not missing.** `space-cards/03` owns storage and
  aggregate invariants, `v1-release/01` owns application initialization/startup,
  and architecture issue `12` asks for a deep module spanning both. Issue `12`
  must either become the named shared seam and block both tickets, or be closed
  as advice; three independent implementations would be contradictory.
- **Aggregate commit policy is duplicated.** `space-cards/03` currently owns the
  operation, `v1-release/08` consumes its complete read/import boundary, and
  architecture issue `13` proposes concentrating the same semantics. Decide
  issue `13` before splitting implementation between persistence and CLI work.
- **Open Spaces composition is duplicated.** `entity-url-addressability/08` owns
  Enter/open UI, `space-cards/12` owns switching/closing persistence safety, and
  architecture issue `14` proposes the shared registry interface. The interface
  owner must be selected before those two feature tickets proceed independently.
- **Layout ownership is settled and inside the tracked release graph.** This
  finding is closed. The decision landed as ADR 0079 — not 0076, which the number
  had moved on to — through `v1-release/20`, which tracked `layout-only-v1/01–04`,
  folded the aggregate criteria into `v1-release/08`, reconciled the Definition of
  Done and the affected URL/Space Card tickets, and superseded `v1-release/04`
  along with the `create-a-layout-from-the-selected-computed-view` tracker.
  Computed Views are to be removed and Add Layout made empty; neither is built.
- **Clean-clone launch has proof but no implementation owner.** `v1-release/07`
  can document and prove it, but any defect found in the supported
  install/Docker/startup path has no named feature ticket. The End-to-end plan
  needs an explicit launch-rehearsal work package or a rule assigning discovered
  launch fixes to ticket 07.
- **Cards View implementation leads its evidence.** `v1-release/02` remains open
  with its core workflow built, but its long/narrow/disabled/refused/failure
  application and Ladle states are not all proved. Finish or deliberately trim
  those criteria in ticket 02; do not schedule the core workflow again.
- Markdown authoring, single-Space persistence, presentation and most current URL
  behavior are built capabilities with no remaining feature ticket. This is not
  missing ownership: `v1-release/07` is their evidence owner.

### Decisions required before ticket 11 can specify End-to-end

1. **Choose the three shared module owners.** Triage architecture issues 12, 13
   and 14 into binding implementation seams or close them, then update the
   blockers of Meta, aggregate and Open Spaces tickets accordingly.
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
4. **Assign clean-clone launch rehearsal.** Name the work package that proves the
   documented Node/pnpm, Docker/PostgreSQL and Chromium stack from a clean clone
   before observed authoring begins.
5. **Place the multi-Space fixture.** Decide whether `space-cards/10` is required
   to make the End-to-end journey observable and repeatable or belongs only to
   final release proof; reflect that choice in ticket 11's blockers.
6. **Choose the End-to-end cut line from this matrix.** Ticket 11 must say which
   partial capabilities are required for meaningful observed use. At minimum the
   journey cannot cross the checkpoint without Meta startup, Default Content,
   all three Card kinds, Layout/Graph authoring, aggregate persistence,
   presentation, complete export/reset/destructive-import recovery and enough
   product treatment to operate those paths accessibly. Final visual polish,
   exhaustive catalogue/release evidence and README/go-no-go work may remain
   between End-to-end and `v1.0.0`.
