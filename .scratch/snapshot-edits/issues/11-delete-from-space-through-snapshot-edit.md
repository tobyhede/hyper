# 11 — Delete from Space through `SnapshotEdit`

Status: done
Blocked by: 03, 08, 09

**What to build:** Space Authoring's `deleted-resource` arm calls `SnapshotEdit.deleteFromSpace` — the operation the session registry already uses — and maps its refusal into `AuthoringRefusal`. With that, `app` holds no Resource membership rule. See `../spec.md`.

**Why:** Deleting a Resource from the Space is currently done in two places: `deletedResourceId`/`withResourceRemovedFromMaps` in Authoring, and `deleteFromSpace` in `graph`. They agree today only because both were written carefully.

## Build

- [x] `deleted-resource` checks, in this order: `resource-not-found`; a Space Resource refuses `space-resource-deletion-unsupported` (it stays in Authoring, and must be decided **before** the module, so a Space Resource with incoming Reference Resources still answers it); then `deleteFromSpace`, whose `resource-has-references` maps across unchanged.
- [x] The `deletedResourceId` path through the tail is gone: the module's snapshot already reclaims, removes positions and drops incident Edges in every Map.
- [x] Deleted: `incomingReferences`, `removedResource` from `space-authoring.ts`; `withResourceRemovedFromMaps` and `withoutIncidentEdges` from `snapshot.ts`.

## Tests

- [x] In `space-authoring-operations.test.ts`, `Delete Resource from Space` keeps "refuses a Resource its Reference Resources still point at, naming them", "refuses deleting a Space Resource rather than orphaning the Space it owns", "deletes a Reference Resource and leaves its Target untouched" and "refuses a Resource the Space no longer holds"; the cascade case goes, along with `Expanded Resource geometry`'s "reclaims the room an Open Resource held when it is deleted". Add one Authoring test that a Space Resource with an incoming Reference Resource answers `space-resource-deletion-unsupported`.
- [x] In `snapshot.test.ts`, the three `withResourceRemovedFromMaps` cases go; the `updatePositionedMap` cases stay.

## Done when

- [x] `rg "Placement\.(reclaim|displace|growth)" packages/app/src/space-authoring.ts packages/app/src/snapshot.ts` is empty. `App.tsx`'s `createReferenceFrom` keeps its `Placement.growth` — that is the Reference Resource offset rule (ADR 0093), not a membership rule, and is out of scope.
- [x] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments

- **`removedResource` was already gone** (ticket 09 deleted it with its last caller); this ticket deleted `incomingReferences`, `withResourceRemovedFromMaps` and `withoutIncidentEdges`, and the `SnapshotResources` alias and `titleName` import that only they used. The `deletedResourceId` tail path itself went in 03.
- **The cross-Map cascade is now a module property**: deleting a Resource Open in both Maps leaves each Map's positions and Graphs exactly as removing it Closed from that Map would, and `defaultMap` untouched. It replaces the Authoring cascade case, `Expanded Resource geometry`'s delete-reclaim case and `snapshot.test.ts`'s three cascade cases.
- **`Expanded Resource geometry`'s five-relation fixture went with its last geometry case**; the two routing cases left on it (`resource-not-in-map`, same-size `unchanged`) run on the ordinary positioned fixture.
- The module's header still said creation and deletion were the registry's alone; it now says both callers use them.
- `rg "Placement\.(reclaim|displace|growth)" packages/app/src/space-authoring.ts packages/app/src/snapshot.ts` is empty.
