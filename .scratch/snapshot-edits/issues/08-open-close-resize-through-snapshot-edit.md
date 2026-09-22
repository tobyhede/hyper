# 08 — Open, Close and Resize through `SnapshotEdit`

Status: ready-for-agent
Blocked by: 03

**What to build:** `SnapshotEdit` gains `open`, `close` and `resize`, and Space Authoring's `opened-resource`, `closed-resource` and `resized-resource` arms call them with the working snapshot and the resolved Map, mapping each refusal into `AuthoringRefusal`. The displacement rules leave `app`. See `../spec.md`.

**Why:** These are the rules ADR 0084 and ADR 0093 decided, and they should have one home that both callers can reach.

## Build

- [ ] `open(snapshot, mapId, resourceId)` — refuses `map-not-found`, `resource-not-in-map`; `unchanged` if already Open; opens at the remembered Open Size or the default for the Resource's kind (`DEFAULT_SPACE_RESOURCE_OPEN_SIZE` for a Space Resource, `DEFAULT_OPEN_SIZE` otherwise, read from the snapshot's document); displaces by that size's growth.
- [ ] `close(snapshot, mapId, resourceId)` — refuses `map-not-found`, `resource-not-in-map`; `unchanged` if Closed; reclaims the growth of the size it was Open at and keeps the Open Size (ADR 0066).
- [ ] `resize(snapshot, mapId, resourceId, size)` — refuses `map-not-found`, `resource-not-in-map`, `resource-not-expanded` (the code Authoring already uses; no `resource-not-open`); `unchanged` at the same size; exactly `COLLAPSED_RESOURCE_SIZE` is a Close; otherwise displaces by the difference in growth.
- [ ] The magnetic 24-unit range (ADR 0066) stays in `app` as `snapResourceSizeToClose`; only an exact Closed Size reaches `resize` as a Close.
- [ ] `withRoomFor`, `roomBetween` and `closedResource` are deleted from `space-authoring.ts`. Their reasoning moves into the module's comments rather than vanishing: why a shrinking resize is not an involution and is memoryless as Close is, and why a magnetic Close reclaims the Open Size's growth rather than the proposal's.
- [ ] `SnapshotEditRefusal` gains the new codes; `graph-package-surface.test.ts` is unchanged unless a new name is exported.

## Tests

- [ ] Property tests in `packages/graph/test/snapshot-edits.property.test.ts`: Open then Close restores every position; Open, any number of Resizes, then Close restores every position; resize A→B→A restores positions; resize to Closed Size equals Close; Close reclaims from a Resource moved beside the Open Resource after it opened, on one axis (ADR 0093); every completed snapshot passes `loadSpaceSnapshot`.
- [ ] `displacement.property.test.ts` is deleted — its three cases are rule round trips, now held by the properties above.
- [ ] In `space-authoring-operations.test.ts`, `Expanded Resource geometry` keeps one test per refusal code Authoring maps (including the stale resize answering `resource-not-expanded`) and the tests that remember the Open Size across Close and Open. The geometry cases that restate displacement go; the three removal cases at the end of the block belong to 09 and 11.

## Done when

- [ ] `rg "Placement\.(displace|growth)" packages/app/src/space-authoring.ts` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments
