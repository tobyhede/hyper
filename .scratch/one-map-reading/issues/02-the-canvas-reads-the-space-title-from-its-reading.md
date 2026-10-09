# 02: The canvas reads the Space title from its reading

**What to build:** `SpaceCanvas` drops its `spaceTitle` prop and reads `reading.view.space.title`.

**Blocked by:** 01.

**Status:** resolved

**Spec:** `.scratch/one-map-reading/spec.md`.

- [x] `spaceTitle` is no longer a `SpaceCanvas` prop; `SpaceCanvas-types.test.tsx` bans it.
- [x] Every `SpaceCanvas` test still passes over the surface `composeApp` returns.
- [x] No behaviour change.
- [x] Resolved with an `## Answer` recording what landed.

## Answer

**What landed.** `SpaceCanvasProps` no longer has `spaceTitle`. `SpaceCanvas` reads `reading.view.space.title`, the Space the reading's `MapView` was built from (ticket 01), and passes it to `GraphHud` as before. `App` and the three files that mount `SpaceCanvas` directly (`SpaceCanvas.test.tsx`, `edge-authoring-react.test.tsx`, `space-canvas-opening-framing.test.tsx`) stopped passing it. Those tests mount over the surface `composeApp` returns, so the HUD now shows that Space's own title in place of the `"Test Space"` literal. No test asserted on the literal, and all pass unchanged.

**The red.** `SpaceCanvas-types.test.tsx` adds `'spaceTitle'` to the props the surface or reading answers. Before the prop was removed, `pnpm typecheck` failed with `Type 'ExpectNever<"spaceTitle">' has no call signatures`. It passes now.

**Not changed.** The `spaceTitle` props on `GraphHud`, `ShellNotice` and the entity actions belong to other components. No story, Ladle spec or E2E spec mounted `SpaceCanvas` with the prop.
