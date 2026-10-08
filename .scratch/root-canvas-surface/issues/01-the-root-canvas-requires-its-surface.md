# 01: The root canvas requires its surface

**What to build:** `SpaceCanvas` can no longer be mounted without a Map surface, and draws under exactly the policy that surface holds. The `authoring` fallback for a missing surface is gone. Every test that mounts `SpaceCanvas` builds a real surface through one shared helper over `composeApp` and `createMapSurface`.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Spec:** `.scratch/root-canvas-surface/spec.md`.

- [ ] Red first: a root `SpaceCanvas` whose surface holds the inert policy offers no canvas authoring; the test fails while the canvas ignores its surface's policy.
- [ ] `surface` is required on `SpaceCanvas`; no default policy remains.
- [ ] One shared test helper builds a surface over a composed Space, and every test file mounting `SpaceCanvas` uses it.
- [ ] The answer is recorded here: is a canvas context's `presentingResourceId` non-null exactly when Navigation is presenting? (It decides whether ticket 02 derives `presenting` or keeps it a prop.)
- [ ] No behaviour change: existing unit, E2E and Ladle E2E pass.
