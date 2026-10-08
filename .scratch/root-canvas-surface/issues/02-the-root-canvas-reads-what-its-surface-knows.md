# 02: The root canvas reads what its surface knows

**What to build:** `SpaceCanvas` takes its surface, the reading `useMapSurface` answers for it, Resource placement whole, and only the inputs the root alone has. It works out the rest itself: placed Resources, Graphs, colours and Map title from the reading's view; nodes, edges, projected nodes, selection and its handlers, node and Edge changes, resize, embedded-editing reports and placement readiness from the reading's canvas rendering; availability from the reading; Space Authoring and Edge Authoring from the surface; the Map id, Active Graph and (per ticket 01's answer) presenting from the surface's context; the next Resource title from the Space session. `App` keeps its one `useMapSurface` call, keeps `useMapView` for the Dock and the presenting stage, and stops unpacking the surface.

**Blocked by:** 01.

**Status:** ready-for-agent

**Spec:** `.scratch/root-canvas-surface/spec.md`.

- [ ] `SpaceCanvas` receives no prop the surface or its reading already answers.
- [ ] The five drop and paste callbacks are replaced by one placement value.
- [ ] Placement readiness and the live projection stay separate facts; the comment explaining the null projection sits where `SpaceCanvas` reads it.
- [ ] Root-only inputs stay explicit named props; no new aggregate props type.
- [ ] `App` still makes exactly one `useMapSurface` call for the root and keeps the replacement-epoch `key`.
- [ ] The `SpaceCanvas` prop-type test reflects the new interface.
- [ ] No behaviour change: existing unit, E2E and Ladle E2E pass.
