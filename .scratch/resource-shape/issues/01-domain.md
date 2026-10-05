# 01 — Shape on the Map entry

Status: resolved
Blocked by: None

**What to build:** a Map entry for a Resource carries a required `shape`, one of `rectangle | pill | ellipse | diamond | hexagon`, beside position, Open/Closed state and Open Size. Add Resource and Add to Map write `rectangle`; Remove from Map drops it with the entry. Every other Edit that rewrites an entry (Move, Open, Close, Resize, displacement) preserves it. A new Edit changes one Resource's Shape on one Map; choosing the Shape it already has is `unchanged`. Intake, export and import carry the field; every tracked fixture, seed and the roadmap generator write `rectangle`. There is no rule reading a missing `shape` as rectangle (ADR 0054, ADR 0056).

**Acceptance:** the schema refuses an entry without `shape` and an unknown value; unit tests cover each creation path writing `rectangle`, each placement Edit preserving it, the Shape Edit's `completed`/`unchanged`, and undo; the aggregate round trip preserves a non-default Shape on both databases through the shared repository contract.

## Answer

Built. A Map entry carries a required `shape` from `RESOURCE_SHAPES` (`rectangle | pill | ellipse | diamond | hexagon`) on both arms of `resourcePlacementSchema` in `packages/core/src/schema.ts`; `ResourceShape` is its type and `ADDED_RESOURCE_SHAPE` (`rectangle`) is what every creation path writes. Nothing reads a missing `shape`: intake refuses it.

- **Creation**: `SnapshotEdit.createInMap` (Add Resource, Create Reference, Create Image Resources, create-and-connect, and the registry's Space Resource create/link), `SnapshotEdit.addToMap` (Add to Map, which gives the rectangle back after Remove from Map forgot a Shape), `initializeSpace` (new Space) and `Placement.point` for a bare point all write `rectangle`.
- **Preservation**: `Placement.point`, `next`, `displace`, `reclaim`, `place` carry the Shape through; `Placement.equals` compares it. Open, Close, Resize, the magnetic Close, a settled drag and displacement keep every entry's Shape.
- **The Edit**: `SnapshotEdit.changeResourceShape` and Space Authoring's `changed-resource-shape` completion — `resource-not-in-map`, `unchanged` for the Shape it has (Open or Closed), otherwise one Edit on one Map's entry. There is no undo mechanism in V1; "undo" is held as choosing the previous Shape restoring the placement exactly. Cascade row added to `docs/agents/authoring-refusal-cascade.md`.
- **Export/import**: the aggregate writer builds each entry through `Placement.fromMap`, which writes `shape` last on an entry (after `openSize`). Every tracked fixture (`packages/app/fixture/**`, `packages/app/example/space.json`), the README example, seeds and generators (`scripts/roadmap.ts`, persistence-cost and drag-benchmark scenarios) write `rectangle`.
- **Lint**: `anti-slop/no-shape-in-symbol-names` gained an `allowedNames` option (exact whole identifier) so the field `shape` is writable; compounds are spelled `resource shape`. Recorded in `.oxlintrc.json`, `PROVENANCE.md` and `docs/agents/anti-slop.md`.

Tests that hold it: `packages/core/test/schema.test.ts` (`a Shape on each entry`), `packages/graph/test/placement.test.ts`, `packages/graph/test/snapshot-edits.property.test.ts` (Shape kept through Open/Resize/Close; `changeResourceShape` completed/unchanged/refused and its inverse; create and Add to Map write `rectangle`), `packages/app/test/space-authoring-operations.test.ts` (`Change Shape`), `test/unit/aggregate-round-trip.test.ts` (non-default Shapes round-trip the CLI aggregate), `test/unit/export-aggregate.test.ts` (canonical order from shuffled keys), `test/unit/sql-fast-path-decision.test.ts` (a `reshape` op is Map-internal and takes the fast path), and `test/support/repository-contract.ts` (`keeps every Resource's Shape through initialization, commit and load`, run on memory and SQLite locally; PostgreSQL in CI).

## Revised: the Shape is optional

User decision: a field is optional and the application chooses a sensible default, as a Graph's `headShape` is (ADR 0105). The schema now has `shape: resourceShapeSchema.optional()`; `resourceShape(entry)` in `packages/core/src/resource-shape.ts` answers `entry.shape ?? DEFAULT_RESOURCE_SHAPE` (`rectangle`), and the projection, the rail's chosen Shape, the Shape Edit's `unchanged` and intake's Ur-only check read through it. Add Resource, Add to Map, `initializeSpace` and a bare `Placement` point write no Shape; choosing a Shape writes the one chosen, the rectangle included. Intake accepts an absent Shape and a stored `rectangle` on every kind. Fixtures, seeds, generators and the README example are back to their pre-Shape content. ADR 0121, `maps-and-graphs.md` R47/A23 and `docs/aggregate-directory.md` say so.
