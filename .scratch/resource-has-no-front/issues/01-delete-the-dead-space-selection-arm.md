# 01: Delete the dead Space selection arm

**What to build:** Remove the `space` arm's `selection` from `CanvasResourceFront`, `ResourceNodeData.spaceSelection`, the `kindFrontOf` line that copies it, and the `spaceSelection` branches in `CanvasResource`, with the unit tests that reach them. No production path sets it; the Space Resource rail draws `SpaceResourceSelectors` itself (`build-space-resource-rail.tsx`), and that component stays.

**Blocked by:** None.

**Status:** resolved

**Spec:** `.scratch/resource-has-no-front/spec.md`, decision 8.

- [ ] No `selection` on any Resource kind's operations and no `spaceSelection` on node data.
- [ ] `CanvasResource` draws a Space Resource's rail, portal and waiting state as before.
- [ ] `SpaceResourceSelectors` and its tests are untouched.
- [ ] E2E and Ladle E2E unchanged.
