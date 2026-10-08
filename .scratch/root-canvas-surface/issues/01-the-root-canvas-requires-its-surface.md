# 01: The root canvas requires its surface

**What to build:** `SpaceCanvas` can no longer be mounted without a Map surface, and draws under exactly the policy that surface holds. The `authoring` fallback for a missing surface is gone. Every test that mounts `SpaceCanvas` builds a real surface through one shared helper over `composeApp` and `createMapSurface`.

**Blocked by:** None (can start immediately).

**Status:** resolved

**Spec:** `.scratch/root-canvas-surface/spec.md`.

- [x] Red first — as a type, not a runtime test (see Answer): `SpaceCanvas-types.test.tsx` asserts `surface` is `MapSurface`; `pnpm typecheck` failed with `Expected: ..., Actual: undefined` before the change.
- [x] `surface` is required on `SpaceCanvas`; no default policy remains, and the `undefined` branches for continuation, `observeMapSurfaces` and `ChromeContinuation` are gone.
- [x] Every test file mounting `SpaceCanvas` passes a real surface — the one `composeApp` already composes, so no new helper was needed (see Answer).
- [x] The presenting question is answered (see Answer).
- [x] No behaviour change: `vitest run packages/app/test test/unit` passes (2672 passed, 20 skipped); E2E and Ladle E2E are left to CI.

## Answer

**The fallback had no production-reachable behaviour.** `App` always passes `composition.surface`, and `composeApp` builds the root surface with `policy: 'authoring'` fixed, so `surface?.context().policy ?? 'authoring'` answered `authoring` either way. The planned runtime test — an inert root surface withdraws canvas authoring — could not go red on the old code, because the old code with a surface already read its policy, and the root's availability arrives through `surface.availability` in `useMapSurface` rather than through the fallback. What the fallback permitted was *mounting without a surface*, so the regression test holds that at the type, where reintroducing an optional `surface` fails `pnpm typecheck`.

**No shared helper.** `composeApp` already returns the root `surface` built by `createMapSurface`, and all four test files already called it, so each passes the surface it composed.

**Presenting.** The canvas context's `presentingResourceId` is `navigation.activeResourceId()`, which is `presentedResource(state)`: non-null exactly when `state.mode === 'presenting'`, the same test `App` uses for `presenting`. Ticket 02 derives `presenting` from `surface.context()`.
