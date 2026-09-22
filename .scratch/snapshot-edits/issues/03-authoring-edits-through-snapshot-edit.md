# 03 — Space Authoring writes a Map's identity, not its content

Status: done
Blocked by: none (01, 02 and 05 are done)

**What to build:** A prefactor with no behaviour change. `updatePositionedMap` narrows to the fields that are a Map's identity rather than its content — title, `kind`, `activeGraph` and the Space's `defaultMap` — and `deriveCompletedEdit` stops handing it the Map's positions and Graphs whole. Each arm that changes positions or Graphs writes them into the working snapshot itself; the tail folds only the Map's identity over the result. See `../spec.md`.

**Why:** Today the tail writes `completedPlacement` and `ownedGraphs` over the Map whatever the arm did. Once an arm calls a `SnapshotEdit` operation, which answers a whole snapshot, that tail would overwrite what the module wrote — for Delete from Space, putting the deleted Resource's position back in the Map the Edit is drawing. Removing that write first makes each of 08–11 a local change to one arm.

This replaces the original single ticket 03, which an audit on 2026-09-22 found stale in vocabulary (Thing/Diagram/Alias), wrong about what `updatePositionedMap` writes, and without a decision on how the module's snapshot composes with the tail. The work is now split across 03 and 08–11.

## Build

- [x] `updatePositionedMap` takes a Map id, title, and Active Graph, and writes the Map's title, `kind: 'positioned'`, `activeGraph` (carrying the stored one through when the Edit names none, as today) and the Space's `defaultMap`. It no longer takes or writes `positions` or `graphs`, and a Map it does not find is not appended — the module or the arm that creates a Map owns that.
- [x] Every arm of `deriveCompletedEdit` that changes the Map's positions or Graphs writes them into `snapshot` before the tail, in the Map being edited (the resolved Map, which is the embedded Map when `embeddedMapId` is given). The membership arms still use their current helpers; only where the write happens moves.
- [x] `sameSnapshot(previousSnapshot, next)` still answers `unchanged` for an Edit that changed nothing, including a settled drag that landed where it started.
- [x] The Authoring, displacement and placement-copy tests keep their behaviour assertions. Update `snapshot.test.ts` for the narrower helper: seed positions and Graphs in the input snapshot, assert that `updatePositionedMap` preserves them, and move the new-Map case to the `created-map` Authoring tests. Keep the active-Graph carry-through assertion.

## Done when

- [x] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable: no component or story changes.

## Comments

- **A Map `updatePositionedMap` does not hold throws** rather than being silently skipped: the only caller resolves the Map from the same snapshot first, so a miss is a defect, and writing `defaultMap` at a Map that is not there would store a Space intake refuses. `snapshot.test.ts` holds it (`refuses to write a Map the snapshot does not hold`).
- **The new-Map case moved to Authoring's `Add Map` test**, which already asserted the whole constructed Map; it gained the "no Space-level `graphs`" assertion the deleted `snapshot.test.ts` case carried.
- **Deletion no longer writes the drawing Map separately.** `withResourceRemovedFromMaps` already reclaims, unplaces and disconnects in every Map including the one being drawn, so the `deleted-resource` arm applies the cascade and nothing else — the tail used to overwrite the drawing Map with an equal copy after it.
- **Creation places inside its arm.** `createResource` mints, appends and places in one step, so the held `CreatedResource` value and its deferred placement are gone; `createdResourceId` alone survives for the result.
- `removed-resource-from-map` writes its Graphs in its own arm, so the Graph half of the tail no longer has an "unplaced" branch.
