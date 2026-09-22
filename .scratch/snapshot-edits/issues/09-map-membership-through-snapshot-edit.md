# 09 — Add to Map and Remove from Map through `SnapshotEdit`

Status: done
Blocked by: 03

**What to build:** `SnapshotEdit` gains `addToMap` and `removeFromMap`, and Space Authoring's `added-resource-to-map` and `removed-resource-from-map` arms call them, mapping each refusal into `AuthoringRefusal`. See `../spec.md`.

**Why:** Removing a Resource from a Map reclaims its room and drops its incident Edges. Deleting a Resource from the Space does both of those in every Map, so the two removals should share one implementation.

## Build

- [x] `addToMap(snapshot, mapId, resourceId, position, mode)` — `exact` or `avoidingOverlap`; refuses `map-not-found`, `resource-not-found`, `resource-already-in-map`; places the Resource Closed and infers no Edge. The Authoring arm keeps today's `avoidingOverlap`.
- [x] `removeFromMap(snapshot, mapId, resourceId)` — refuses `map-not-found`, `resource-not-in-map`; reclaims, removes the position, and removes the Resource's incident Edges in **this Map's** Graphs only. Graphs stay, empty ones included. Never blocked by an incoming Reference Resource.
- [x] The two Authoring arms stop using `removedResource` and `withoutIncidentEdges`. Both helpers stay until 11, which deletes them with their last caller.

## Tests

- [x] Property tests in `packages/graph/test/snapshot-edits.property.test.ts`: `removeFromMap` touches no other Map; after `removeFromMap` no Edge in the Map names the Resource; `avoidingOverlap` never lands on an occupied point; every completed snapshot passes `loadSpaceSnapshot`.
- [x] In `space-authoring-operations.test.ts`, `Map membership` keeps one test per refusal code and "removing a Resource from one Map is never blocked by an incoming Reference Resource"; the cases restating placement and Edge removal go, along with `Expanded Resource geometry`'s "reclaims the room an Open Resource held when it is removed from the Map" and "moves nobody when the Resource leaving the Map was Closed".

## Done when

- [x] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments

- **`removedResource` is deleted here, not in 11.** Ticket 03 already moved `deleted-resource` onto `withResourceRemovedFromMaps` alone, so once `removed-resource-from-map` moved to the module `removedResource` had no caller and `noUnusedLocals` refused it. `withoutIncidentEdges` stays in `snapshot.ts` for `withResourceRemovedFromMaps` until 11; Authoring no longer imports it.
- **`SnapshotEdit` has one incident-Edge rule and one reclaim-then-remove rule** (`withoutIncidentEdges`, `removedFrom`), shared by `removeFromMap` and `deleteFromSpace`.
- **`addToMap` checks the Map before the Resource**, the order every module operation uses; Authoring's own `map-not-found` gate already ran first, so what reaches the author is unchanged.
- **Properties beyond the list**: removing an Open Resource leaves every other position where removing it Closed would (the reclaim the two dropped `Expanded Resource geometry` cases held), `exact` keeps the aimed point, no Edge is inferred on add, one refusal property over both operations' codes, and never-blocked-by-a-Reference at the module.
- **Kept in `Map membership`**: "adds an absent Space Resource at a deliberate position and infers no Edge" as the one completion-routing case for Add to Map (without it no Authoring test shows the arm completes), the three refusal cases, and the never-blocked case under `Delete Resource from Space`.
