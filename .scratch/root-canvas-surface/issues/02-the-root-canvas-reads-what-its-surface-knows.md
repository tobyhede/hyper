# 02: The root canvas reads what its surface knows

**What to build:** `SpaceCanvas` takes its surface, the reading `useMapSurface` answers for it, Resource placement whole, and only the inputs the root alone has. It works out the rest itself: placed Resources, Graphs, colours and Map title from the reading's view; nodes, edges, projected nodes, selection and its handlers, node and Edge changes, resize, embedded-editing reports and placement readiness from the reading's canvas rendering; availability from the reading; Space Authoring and Edge Authoring from the surface; the Map id, Active Graph and (per ticket 01's answer) presenting from the surface's context; the next Resource title from the Space session. `App` keeps its one `useMapSurface` call, keeps `useMapView` for the Dock and the presenting stage, and stops unpacking the surface.

**Blocked by:** 01.

**Status:** resolved

**Spec:** `.scratch/root-canvas-surface/spec.md`.

- [x] `SpaceCanvas` receives no prop the surface or its reading already answers.
- [x] The five drop and paste callbacks are replaced by one placement value.
- [x] Placement readiness and the live projection stay separate facts; the comment explaining the null projection sits where `SpaceCanvas` reads it.
- [x] Root-only inputs stay explicit named props; no new aggregate props type.
- [x] `App` still makes exactly one `useMapSurface` call for the root and keeps the replacement-epoch `key`.
- [x] The `SpaceCanvas` prop-type test reflects the new interface.
- [x] No behaviour change: existing unit tests pass locally; E2E and Ladle E2E run in CI.

## Answer

**The props.** `SpaceCanvas` takes `surface`, `reading`, `placement`, and the root-only `onDrawnClipboardFailuresChange`, `onDrawnSpacesChange`, `commandOutcomes`, `deleteConfirmation`, `imageReplacement`, `nameOnCreation`, `spaceSession`, `spaceTitle`, `spaceResourceTargets` and `resourceEntityActions`. `SpaceCanvas-types.test.tsx` holds the three new props' types and that none of the twenty-nine props the surface or reading answers remains.

**`reading`** is `MapSurfaceReading`, named in `use-map-surface.ts` as `ReturnType<typeof useMapSurface>`, so the type is whatever the hook answers rather than a second declaration of it.

**`placement`** is `Pick<ResourcePlacementCommands, 'createResource' | 'dropExistingResource' | 'dropSpace' | 'dropImages' | 'pasteImageUrl'>`. `App` passes the `useResourcePlacement` value whole; the `Pick` names the five operations the canvas spends, so a test supplies those and not the Dock's drag and Space-creation commands. `C` is `placement.createResource('markdown')`, as a drawn Map's `addResource` already was.

**The editing reports came from the reading, not as props.** The spec's story 15 lists "the editing reports" among root-only inputs, but `onBodyEditingChange` and `onTitleEditingChange` were `useMapSurface`'s own `setEditingResourceBody` and `setEditingResourceTitle`, which feed the availability that same reading answers. Acceptance criterion 1 (no prop the reading answers) decides it: the canvas reads them off `reading`. The drawn-Map sinks stay props.

**Map id, Active Graph and presenting** come from `surface.context()`; presenting is `kind === 'canvas' && presentingResourceId !== null`, per ticket 01's answer. **The next Resource title** is `nextResourceTitle` over `spaceSession.getState().working`, memoised on that snapshot. **Placement readiness** is `reading.canvasRendering.hasResourcesOnCanvas` and the live projection `liveProjection`, read as two facts; the null-projection comment now sits where `SpaceCanvas` reads `projected`.

**Tests.** `packages/app/test/map-surfaces.ts` gained `canvasReading(surface, parts)`, a reading over the surface's own view with the render adapter's half and availability set by the test, and `IDLE_PLACEMENT`. The three files mounting `SpaceCanvas` use them; a test that spies on authoring or stubs Edge Authoring spreads the composed surface with its own `authoring` or `edgeAuthoring`. Those tests now draw the Map's real Graphs, colours, placed Resources and Active Graph where they used to pass empty or hand-picked values; all pass unchanged.
