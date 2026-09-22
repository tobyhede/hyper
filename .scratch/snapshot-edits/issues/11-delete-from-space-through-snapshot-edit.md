# 11 — Delete from Space through `SnapshotEdit`

Status: ready-for-agent
Blocked by: 03, 08, 09

**What to build:** Space Authoring's `deleted-resource` arm calls `SnapshotEdit.deleteFromSpace` — the operation the session registry already uses — and maps its refusal into `AuthoringRefusal`. With that, `app` holds no Resource membership rule. See `../spec.md`.

**Why:** Deleting a Resource from the Space is currently done in two places: `deletedResourceId`/`withResourceRemovedFromMaps` in Authoring, and `deleteFromSpace` in `graph`. They agree today only because both were written carefully.

## Build

- [ ] `deleted-resource` checks, in this order: `resource-not-found`; a Space Resource refuses `space-resource-deletion-unsupported` (it stays in Authoring, and must be decided **before** the module, so a Space Resource with incoming Reference Resources still answers it); then `deleteFromSpace`, whose `resource-has-references` maps across unchanged.
- [ ] The `deletedResourceId` path through the tail is gone: the module's snapshot already reclaims, removes positions and drops incident Edges in every Map.
- [ ] Deleted: `incomingReferences`, `removedResource` from `space-authoring.ts`; `withResourceRemovedFromMaps` and `withoutIncidentEdges` from `snapshot.ts`.

## Tests

- [ ] In `space-authoring-operations.test.ts`, `Delete Resource from Space` keeps "refuses a Resource its Reference Resources still point at, naming them", "refuses deleting a Space Resource rather than orphaning the Space it owns", "deletes a Reference Resource and leaves its Target untouched" and "refuses a Resource the Space no longer holds"; the cascade case goes, along with `Expanded Resource geometry`'s "reclaims the room an Open Resource held when it is deleted". Add one Authoring test that a Space Resource with an incoming Reference Resource answers `space-resource-deletion-unsupported`.
- [ ] In `snapshot.test.ts`, the three `withResourceRemovedFromMaps` cases go; the `updatePositionedMap` cases stay.

## Done when

- [ ] `rg "Placement\.(reclaim|displace|growth)" packages/app/src/space-authoring.ts packages/app/src/snapshot.ts` is empty. `App.tsx`'s `createReferenceFrom` keeps its `Placement.growth` — that is the Reference Resource offset rule (ADR 0093), not a membership rule, and is out of scope.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments
