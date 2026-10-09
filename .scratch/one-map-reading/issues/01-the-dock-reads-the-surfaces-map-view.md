# 01: The Dock reads the surface's Map view

**What to build:** `MapView` carries the Space it was built from, and `App` takes the Space, the selected Map, the Resources outside it and their memberships from the root surface's reading. `useMapView` and `RenderedMapView` are deleted.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec:** `.scratch/one-map-reading/spec.md`.

- [ ] Red first: through `App`, the Dock's outside Resources and memberships are the same objects as the canvas's `reading.view.resourcesOutsideMap` and `membershipsOutsideMap`; the test fails on today's code, where `useMapView` derives them separately. Projection identity is asserted alongside as supporting evidence (it already holds).
- [ ] The root drawing's Map view is derived once per Space identity or selected Map change.
- [ ] `MapView.space` is the Space `mapView` was given; the `mapView` tests hold it.
- [ ] `App` makes no second `mapView` derivation; `useMapView`, `RenderedMapView` and `newResourceTitle` are gone, with the `useMapView` block in `app-hooks.test.tsx`.
- [ ] The address, disclosure and Stage Copy link still read `navigationState.selectedMapId`, with a comment saying why.
- [ ] No behaviour change: existing unit tests pass locally; E2E and Ladle E2E run in CI.
- [ ] Resolved with an `## Answer` recording what landed, how the red was proven, and how `useResourcePlacement` reads the selected Map.
