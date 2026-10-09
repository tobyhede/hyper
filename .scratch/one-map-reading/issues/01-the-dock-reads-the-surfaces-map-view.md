# 01: The Dock reads the surface's Map view

**What to build:** `MapView` carries the Space it was built from, and `App` takes the Space, the selected Map, the Resources outside it and their memberships from the root surface's reading. `useMapView` and `RenderedMapView` are deleted.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Spec:** `.scratch/one-map-reading/spec.md`.

- [x] Red first: through `App`, the Dock's outside Resources and memberships are the same objects as the canvas's `reading.view.resourcesOutsideMap` and `membershipsOutsideMap`; the test fails on today's code, where `useMapView` derives them separately. Projection identity is asserted alongside as supporting evidence (it already holds).
- [x] The root drawing's Map view is derived once per Space identity or selected Map change.
- [x] `MapView.space` is the Space `mapView` was given; the `mapView` tests hold it.
- [x] `App` makes no second `mapView` derivation; `useMapView`, `RenderedMapView` and `newResourceTitle` are gone, with the `useMapView` block in `app-hooks.test.tsx`.
- [x] The address, disclosure and Stage Copy link still read `navigationState.selectedMapId`, with a comment saying why.
- [x] No behaviour change: existing unit tests pass locally; E2E and Ladle E2E run in CI.
- [x] Resolved with an `## Answer` recording what landed, how the red was proven, and how `useResourcePlacement` reads the selected Map.

## Answer

**What landed.** `MapView` carries `space`, the Space `mapView` was given (`app-derivations.test.ts` asserts it). `App` takes the Space, the selected Map, the projection, the Resources outside the Map and their memberships from the root surface's `reading.view`, and feeds them to the Dock, the presenting Stage, `useSpaceAddresses`, `useResourceRailActions` and `useSpaceResourceTargetTitles`. `useMapView`, `RenderedMapView` and its `newResourceTitle` are deleted with the `useMapView` block in `app-hooks.test.tsx`, and `App` no longer reads `readWorkingSpace`. The address, the Resources disclosure and the Stage's Copy link still read `navigationState.selectedMapId`; a comment in `App.tsx` says Navigation owns the address and `composeApp` builds the canvas surface's `mapId` from that value.

**Placement.** `useResourcePlacement` stays ahead of `useMapSurface`, because the reading needs `placement.creatingSpaceResource`. It reads the selected Map as `composition.surface.view().selectedMap.map`. `surface.view()` answers one memoised view until the Space or the Map id changes, so this is the same object the reading carries in that render. `map-surface.test.ts`, "answers one view until the Space or the selected Map changes", holds that: the view keeps its identity across reads, is rebuilt on `selectMap` and on a completed Edit, and its `space` is `currentSpace()`.

**The red.** `SpaceApp.test.tsx`, "Space app Map reading › draws the Dock from the very Map view the canvas reads", mounts `App` over the composition with the surface's `view` wrapped. The wrapper returns a memoised copy of the real view that no `mapView` call could produce: the unplaced Resource is left out of `resourcesOutsideMap`, `membershipsOutsideMap` is empty, and the Active Graph's colour is `#123456`. The test asserts that the Dock lists exactly the view's outside Resources, that the remaining row has no membership `aria-describedby`, and, as supporting evidence that already held, that the Dock's Graph glyph is stroked `#123456`. Nothing is module-mocked and `mapView` is not spied on. With `App.tsx`, `map-view.ts` and `SpaceCanvas.tsx` checked out from the base commit, it failed with `expected [ 'Add Outside resource to Map', …(1) ] to deeply equal [ 'Add Outside resource to Map' ]`, the extra row being the unplaced Resource from `useMapView`'s separate derivation. Restoring a second derivation for the memberships alone fails the `aria-describedby` assertion, so each list fails on its own.
