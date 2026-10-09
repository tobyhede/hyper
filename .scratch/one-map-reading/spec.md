# One Map reading for the Dock and the canvas

Status: resolved

## Problem Statement

`App` reads the Map it draws twice. `useMapView` builds a `MapView` over the snapshot `SpaceAuthoring` published and Navigation's `selectedMapId`, and hands the Dock, the presenting Stage and the root-only hooks `renderedSpace`, `selectedMap`, `resourcesOutsideMap` and `membershipsOutsideMap`. The root Map surface builds a second `MapView` in `surface.view()` over `currentSpace()` and the surface context's `mapId`, which the canvas reads through `useMapSurface` and from which `App` already takes the Dock's `projection`. Both call `mapView(space, mapId)` over the one `readWorkingSpace`, so each change of Space identity or selected Map derives the root drawing's Map view — `canvasProjection` included — twice. Only the surface's projection is used (the Dock's `projection` already comes from `composition.surface.view()`); the Dock's selected Map, outside Resources and memberships come from the other derivation, so the Dock is fed from both.

The two agree at render: `SpaceAuthoring` republishes synchronously whenever the session or Navigation publishes, outside its synchronous `installTogether` window, and the root surface's `mapId` is `navigation.getState().selectedMapId`. Nothing makes them agree, though, and a reader of `App` cannot tell which of the two a value came from.

## Solution

The Dock and the canvas read one `MapView`: the root surface's. `MapView` carries the Space it was built from, so `App` takes the Space, the selected Map, the Resources outside it and their memberships from `reading.view`, and `useMapView` is deleted. `SpaceCanvas` reads the Space title off its reading rather than taking it as a prop.

## User Stories

1. As a developer, I want the Dock and the canvas to read the same `MapView` object, so that they cannot draw the Map from two derivations.
2. As a developer, I want the Map view derived once per Space identity or selected Map change, per drawing, so that `canvasProjection` is not built twice for one Space.
3. As a developer, I want a `MapView` to carry the Space it was built from, so that the view and the Space cannot come from different snapshots.
4. As a developer reading `App`, I want every value about the drawn Map to come from the surface's reading, so that I need not ask which of two views it came from.
5. As a developer, I want the address, disclosure and presenting Copy link to keep reading the Map id from Navigation, with the reason stated, so that the remaining `selectedMapId` reads are not mistaken for an oversight.
6. As a developer, I want `SpaceCanvas` to take no prop its reading answers, the Space title included, so that candidate 3's rule holds without exception.
7. As an author, I want the Dock, the canvas and the Stage to behave exactly as before, so that this refactor is invisible to me.

## Implementation Decisions

- Scope is candidate 6 of the 2026-10-08 architecture review, narrowed: one Map reading. `useDockChrome`'s input shape is unchanged; no opened-Space object is introduced. Revisit that only if the Dock's input is shown to keep churning.
- `MapView` gains `space: Space`; `mapView(space, mapId)` returns the Space it was given. `surface.view()`'s existing memo, keyed on Space identity and Map id, covers it. Drawn Map surfaces carry it too.
- `App` takes `space`, `selectedMap`, `resourcesOutsideMap` and `membershipsOutsideMap` from `reading.view`, which feeds the Dock, the presenting Stage, `useSpaceAddresses`, `useResourceRailActions`, `useSpaceResourceTargetTitles` and `useResourcePlacement`. `useResourcePlacement` is called before `useMapSurface` today because the reading needs `creatingSpaceResource`; read the selected Map for placement from `composition.surface.view()` or reorder, whichever keeps one `MapView` identity.
- `useAddressedResource`, `useResourcesDisclosure` and the Stage's Copy link keep `navigationState.selectedMapId`: it is the root surface context's `mapId` by construction, and Navigation owns the address.
- Deleted: `useMapView`, `RenderedMapView` and its `newResourceTitle` (`SpaceCanvas` and `EmbeddedMapAuthoring` mint their own).
- `SpaceCanvas`'s `spaceTitle` prop is deleted; it reads `reading.view.space.title`.
- No ADR: this carries out ADR 0112's one surface per drawing. No `CONTEXT.md` change: `MapView` is a code name.

## Testing Decisions

- New, red first: through `App`, the Dock's outside Resources and memberships are the very `resourcesOutsideMap` and `membershipsOutsideMap` of the canvas's `reading.view`. `mapView` builds both fresh on every call, so identity is how a test observes that one derivation feeds both; today they come from `useMapView`'s separate derivation and the test fails. Projection identity is asserted alongside as supporting evidence only — it already holds, because `App` takes the Dock's `projection` from `composition.surface.view()`.
- Derivation is not counted by spying on `mapView`: module mocking is banned (`no-module-mocking`, `docs/agents/anti-slop.md`), and adding a composition seam only to count calls would be a single-adapter port.
- `mapView` tests gain that `space` is the Space given. The `useMapView` block in `app-hooks.test.tsx` goes with the hook.
- `SpaceCanvas-types.test.tsx` bans `spaceTitle`.
- E2E and Ladle E2E are the behaviour-unchanged evidence and run in CI.

## Out of Scope

- An opened-Space object feeding `useDockChrome` and `SpaceCanvas` (the report's broad form of candidate 6).
- Changing `useDockChrome`'s input, `MapSurface`'s interface beyond `MapView.space`, or `useMapSurface`'s answer.
- Any behaviour change.

## Further Notes

- Source: candidate 6 of the 2026-10-08 architecture review, recorded in `.scratch/architecture-review/2026-10-08-root-canvas-candidates.md`, grilled 2026-10-09.
- Follows `.scratch/root-canvas-surface/`, whose ticket 03 (docs) is still open.
