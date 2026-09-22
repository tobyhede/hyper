# 08 — Open, Close and Resize through `SnapshotEdit`

Status: done
Blocked by: 03

**What to build:** `SnapshotEdit` gains `open`, `close` and `resize`, and Space Authoring's `opened-resource`, `closed-resource` and `resized-resource` arms call them with the working snapshot and the resolved Map, mapping each refusal into `AuthoringRefusal`. The displacement rules leave `app`. See `../spec.md`.

**Why:** These are the rules ADR 0084 and ADR 0093 decided, and they should have one home that both callers can reach.

## Build

- [x] `open(snapshot, mapId, resourceId)` — refuses `map-not-found`, `resource-not-in-map`; `unchanged` if already Open; opens at the remembered Open Size or the default for the Resource's kind (`DEFAULT_SPACE_RESOURCE_OPEN_SIZE` for a Space Resource, `DEFAULT_OPEN_SIZE` otherwise, read from the snapshot's document); displaces by that size's growth.
- [x] `close(snapshot, mapId, resourceId)` — refuses `map-not-found`, `resource-not-in-map`; `unchanged` if Closed; reclaims the growth of the size it was Open at and keeps the Open Size (ADR 0066).
- [x] `resize(snapshot, mapId, resourceId, size)` — refuses `map-not-found`, `resource-not-in-map`, `resource-not-expanded` (the code Authoring already uses; no `resource-not-open`); `unchanged` at the same size; exactly `COLLAPSED_RESOURCE_SIZE` is a Close; otherwise displaces by the difference in growth.
- [x] The magnetic 24-unit range (ADR 0066) stays in `app` as `snapResourceSizeToClose`; only an exact Closed Size reaches `resize` as a Close.
- [x] `withRoomFor`, `roomBetween` and `closedResource` are deleted from `space-authoring.ts`. Their reasoning moves into the module's comments rather than vanishing: why a shrinking resize is not an involution and is memoryless as Close is, and why a magnetic Close reclaims the Open Size's growth rather than the proposal's.
- [x] `SnapshotEditRefusal` gains the new codes; `graph-package-surface.test.ts` is unchanged unless a new name is exported.

## Tests

- [x] Property tests in `packages/graph/test/snapshot-edits.property.test.ts`: Open then Close restores every position; Open, any number of Resizes, then Close restores every position; resize A→B→A restores positions; resize to Closed Size equals Close; Close reclaims from a Resource moved beside the Open Resource after it opened, on one axis (ADR 0093); every completed snapshot passes `loadSpaceSnapshot`.
- [x] `displacement.property.test.ts` is deleted — its three cases are rule round trips, now held by the properties above.
- [x] In `space-authoring-operations.test.ts`, `Expanded Resource geometry` keeps one test per refusal code Authoring maps (including the stale resize answering `resource-not-expanded`) and the tests that remember the Open Size across Close and Open. The geometry cases that restate displacement go; the three removal cases at the end of the block belong to 09 and 11.

## Done when

- [x] `rg "Placement\.(displace|growth)" packages/app/src/space-authoring.ts` is empty.
- [x] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments

- **The refusal mapping is the identity, typed.** Every `SnapshotEditRefusal` code is one `AuthoringRefusal` already names with the same context, so `authoringRefusal` in `space-authoring.ts` is `(refusal) => refusal` and the compiler holds it: a module code Authoring does not name fails to typecheck there. `notCompleted` turns a non-completed outcome into the derivation's answer, and 09–11 reuse both.
- **`open` reads the Resource's kind off the snapshot document**, not the loaded Space's lookup, since the module has only the snapshot.
- **The witness property writes the move into the snapshot directly** rather than through `settled-resource-movement`, which is Authoring's completion and not a `SnapshotEdit` operation. Settled movement keeps its own coverage in `authoring-placement-copy.test.ts`, which `space-authoring.property.test.ts`'s comment now names in place of the deleted file.
- **Two properties beyond the list**: a map-not-found / resource-not-in-map refusal property over all three operations, and `resource-not-expanded` for any Closed subject. Every property asserts `loadSpaceSnapshot` accepts each completed snapshot through one `completed` helper.
- **Kept in `Expanded Resource geometry`**: the two Open-Size-memory tests, the stale resize (`resource-not-expanded`), the unknown subject (`resource-not-in-map`), and the same-size resize as the `unchanged` routing case. The five-relation fixture stays for the three removal cases 09 and 11 own.
- Mutation check: making `open` ignore the remembered Open Size fails four of the new properties.
