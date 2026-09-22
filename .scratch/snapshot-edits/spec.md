# Resource membership Edits have one home

The rules that turn a Space snapshot into the next one when a Resource joins, grows, shrinks or leaves a Map live in the pure `@project/graph` module `SnapshotEdit`. Space Authoring and the session registry both call it. Space Authoring reads placement from the working snapshot; it no longer keeps a second copy.

Grilled out of the 2026-09-16 architecture review (candidate 1, "One Space-snapshot Edit module in `graph`"). No new ADR: this finishes what ADR 0084 and ADR 0086 already decided. Tickets 01, 02 and 04–07 are done. Tickets 03 and 08–11 finish the move through Space Authoring.

## Why

The session registry and Space Authoring once held separate Resource placement and deletion rules. The registry's former removal path did not reclaim the room of an Open Space Resource, its deletion path did not give a useful refusal when a Reference Resource targeted the deleted Resource, and its menu creation could stack at an occupied anchor. Ticket 01 moved the registry onto `SnapshotEdit` and covered those cases with tests.

Authoring also held a placement beside the Map's stored `positions`. Render-time layout and drawn-to-authored coordinate conversion had originally required that copy; ADR 0086 and ADR 0084 removed those reasons. Ticket 02 deleted the copy and made completed Edits read the working snapshot at derivation time. A refused drag now returns to its stored position, while a queued drag keeps its draft until its Edit is derived.

## Design

### `SnapshotEdit` in `@project/graph`

- **Input and answer:** Operations take a `SpaceSnapshot` and answer `completed(snapshot) | unchanged | refused(code)`. Domain refusals carry typed context; each caller maps them into its own refusal vocabulary. `SnapshotEdit` is offered through the curated `graph` index.
- **Operations:** `createInMap` and `deleteFromSpace` are built for the session registry. `open`, `close`, `resize`, `addToMap` and `removeFromMap` arrive with tickets 08 and 09. Ticket 10 brings Authoring creation through `createInMap`; ticket 11 brings Authoring deletion through `deleteFromSpace`.
- **Scope:** The module changes Resource entries, positions in the named Map or every Map for deletion, and incident Edges in the affected Maps. It does not choose `defaultMap`, rename a Map, or choose its Active Graph. Authoring owns those decisions.
- **Placement:** `open`, `close` and `resize` apply ADR 0084 and ADR 0093 displacement to the snapshot. Close preserves the remembered Open Size. A resize to exactly `COLLAPSED_RESOURCE_SIZE` is Close; the 24-unit magnetic range remains in the application.
- **Creation:** `createInMap` adds the caller-minted Resource and places it either `exact` at an aimed drop point or `avoidingOverlap` at a menu anchor. Ticket 10 adds Reference Resource Target checks against the snapshot: `reference-target-not-found` and `reference-target-must-own-content`.
- **Removal:** `removeFromMap` reclaims an Open Resource's room and drops its incident Edges only in that Map. `deleteFromSpace` does so across every Map, removes the Resource entry, and refuses a Resource with incoming Reference Resources. Authoring continues to refuse direct deletion of a Space Resource, whose cascade belongs to the session registry.

### Authoring's Map write

`deriveCompletedEdit` currently holds a Map's placement and Graphs until a tail call to `updatePositionedMap`, which writes both whole. A `SnapshotEdit` operation instead returns a whole snapshot. Ticket 03 first narrows `updatePositionedMap` to the Map's identity fields and the Space's `defaultMap`, and makes each Authoring arm write positions and Graphs into the working snapshot before that tail. It also moves new-Map construction into the `created-map` arm. Thus the tail cannot overwrite a module operation's result. Tickets 08–11 then move one completion family at a time onto `SnapshotEdit`.

### Coordinated operations

Tickets 04–07 made coordinated operations decide against current state after their last asynchronous wait. `prepare` performs waits; synchronous `plan` applies the current rules and returns changes or a refusal. No wait separates `plan` from installing its result. Space Resource deletion plans the target-Space cascade there too.

### Tests

Rules move to property tests over snapshots in `packages/graph/test/snapshot-edits.property.test.ts`. Authoring tests retain completion routing, refusal mapping, queueing, ordering and Open Size behaviour; duplicated geometry and cascade assertions leave as their operation moves. Ticket 03 updates `snapshot.test.ts` to prove the narrowed `updatePositionedMap` preserves existing positions and Graphs, while `created-map` Authoring tests own new-Map construction.

## Tickets

| Ticket | Blocked by | Status |
|---|---|---|
| [01 — The session registry edits snapshots through `SnapshotEdit`](issues/01-registry-edits-through-snapshot-edit.md) | none | done |
| [02 — Space Authoring stops keeping its own placement](issues/02-remove-authorings-placement-copy.md) | none | done |
| [03 — Space Authoring writes a Map's identity, not its content](issues/03-authoring-edits-through-snapshot-edit.md) | none | done |
| [04 — A Space Resource deletion refuses when a Reference Resource arrives during its wait](issues/04-deletion-decides-after-its-last-wait.md) | none | done |
| [05 — Space Resource creation and linking refuse when their Map goes during the wait](issues/05-creation-decides-after-its-last-wait.md) | 04 | done |
| [06 — Map and Graph deletion decide their successor after their last wait](issues/06-context-deletion-decides-after-its-last-wait.md) | 04 | done |
| [07 — The coordination has one shape](issues/07-one-coordination-shape.md) | 05, 06 | done |
| [08 — Open, Close and Resize through `SnapshotEdit`](issues/08-open-close-resize-through-snapshot-edit.md) | 03 | done |
| [09 — Add to Map and Remove from Map through `SnapshotEdit`](issues/09-map-membership-through-snapshot-edit.md) | 03 | done |
| [10 — Creation through `createInMap`](issues/10-creation-through-create-in-map.md) | 03 | done |
| [11 — Delete from Space through `SnapshotEdit`](issues/11-delete-from-space-through-snapshot-edit.md) | 03, 08, 09 | done |

## Out of scope

- Map and Graph context-command rules, including their successor and keep-last rules, and the dead `deleted-map`/`deleted-graph` Authoring arms.
- Splitting `deriveCompletedEdit` into completion families or changing deletion routing by Resource kind.
- Edge operations beyond dropping Edges incident to a Resource removed from a Map or Space.
