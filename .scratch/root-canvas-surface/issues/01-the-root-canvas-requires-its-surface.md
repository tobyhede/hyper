# 01: The root canvas requires its surface

**What to build:** `SpaceCanvas` can no longer be mounted without a Map surface, and draws under exactly the policy that surface holds. The `authoring` fallback for a missing surface is gone. Every test that mounts `SpaceCanvas` builds a real surface through one shared helper over `composeApp` and `createMapSurface`.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Spec:** `.scratch/root-canvas-surface/spec.md`.

- [x] Red first: a root `SpaceCanvas` whose surface holds the inert policy offers no canvas authoring; the test fails while the canvas ignores its surface's policy. (Held at the drawn-Map ceiling — see Answer.)
- [x] `surface` is required on `SpaceCanvas`; no default policy remains.
- [x] One shared test helper builds a surface over a composed Space, and every test file mounting `SpaceCanvas` uses it. (Partly — see Answer.)
- [x] The answer is recorded here: is a canvas context's `presentingResourceId` non-null exactly when Navigation is presenting? (It decides whether ticket 02 derives `presenting` or keeps it a prop.)
- [x] No behaviour change: existing unit, E2E and Ladle E2E pass.

## Answer

**Where the root policy is observable.** A non-authoring root withdraws all of the root's own availability through `surface.availability` in `useMapSurface`, which `App` hands to `SpaceCanvas` — so the canvas's own authoring never depended on `SpaceCanvas` reading the policy. What `SpaceCanvas` reads it for is the ceiling its first-level drawn Maps inherit: `rootPolicy` becomes the embedded root's policy, which `mapSurfacePolicy` takes as `inherited`. The regression test holds that: `space-resource-embedded-map.test.tsx`, "keeps a drawn Map inert under a canvas surface that holds the inert policy", begins portal Edit while the canvas authors, then holds the canvas surface at `inert` and asserts the drawn Resource takes `nodrag` and `pointer-events: none`. With `rootPolicy` hard-coded to `'authoring'` it failed (`expected [ 'react-flow__node', …(5) ] to include 'nodrag'`). Inert from mount cannot separate the two, because Edit on the Space Resource is then never offered. `SpaceCanvas-types.test.tsx` also holds that `surface` is required: `pnpm typecheck` failed on the optional prop.

**The helper.** `packages/app/test/map-surfaces.ts`'s `holdCanvasPolicy` fixes a canvas surface's context at a policy through the surface's own `update`. It does not build a surface with `createMapSurface`: drawn Maps need the Open Spaces mount, and `OpenSpacesApplication` mounts the surface `composeApp` composes, so a separately built one cannot be put under it. The three files that mount `SpaceCanvas` directly (`SpaceCanvas.test.tsx`, `edge-authoring-react.test.tsx`, `space-canvas-opening-framing.test.tsx`) pass the surface `composeApp` already returns, which needs no helper.

**Presenting.** The canvas context's `presentingResourceId` is `navigation.activeResourceId()`, which is `presentedResource(state)`: non-null exactly when `state.mode === 'presenting'`, the same test `App` uses for `presenting`. Ticket 02 derives `presenting` from `surface.context()`.

**Also.** `useCanvasResourceAuthoring`'s and the decoration context's `continuation` are now required: both production callers always pass one, and only two tests had omitted it.
