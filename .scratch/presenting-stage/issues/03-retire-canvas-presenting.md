# 03: Retire canvas presenting

**What to build:** Nothing on the canvas knows about presenting any more. A canvas Resource is only Closed or Open, and the camera machinery that framed a presented Resource is gone, so canvas presenting does not linger dormant behind the Stage.

**Blocked by:** 02 — Present on the Stage.

**Status:** resolved — `1637e45d`; draft PR #341 `CI passed` observed green (run on `d22923ad`).

- [x] The projection's presented display and the option that asked for it are deleted; a canvas node's display is Closed or Open, and every test fixture that set the option is updated.
- [x] The presenting and overview cameras, the presenting padding and both camera durations are deleted with their tests. The overview fit constant stays, because it frames a Map when the canvas opens.
- [x] The canvas presented-content styles and the active-Resource outline are deleted, with their design-system inventory entries; the container-unit type rules live on the Stage.
- [x] The zoom ceiling stays at 16, and its doc comment gives the authoring reason instead of the presenting one.
- [x] The root README's presenting prose and its known-limitation line about camera rasterisation, and the rendering guide's camera presenting section, describe the Stage.
- [x] `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm ui:catalog:check`, targeted lint and the affected unit, e2e and Ladle specs pass locally; the draft PR's `CI passed` gate is observed green before resolution.

**Decisions taken:**

- **Red first.** `canvas-projection.test.ts` was rewritten to assert that the projection names no traversal position (no `active` on node data) and draws each Resource Closed or Open as its Map authors it; it failed on the `presented` display before any deletion. `pnpm ui:catalog:check` was red on the stale `resource` and `resource-image` inventory entries once the CSS went, and green again after they were removed.
- **The display union is `closed | open | editing | replacing`.** With `presented` gone, `FrontDisplay` equalled `ResourceDisplay`, so it is deleted and every consumer names `ResourceDisplay`. `atRest` loses its second overload.
- **The active flag went with the outline.** `ResourceNodeData.active`, `data-active`, the `rf-resource-node--active` class and the `activeResourceId` projection option existed only for presenting, so they are deleted along with `showActiveResourceContent`. `CanvasInteraction`, `CanvasRenderingInput`, `MapSurface.project` and `useMapSurface` no longer take `activeResourceId` or `presenting` for drawing; `useMapSurface` keeps `presenting` for authoring availability, which still withdraws authoring while the canvas is inert. The e2e helper `activeResource` is deleted; `editing.spec.ts` hovers the canvas node by title instead.
- **Cameras.** `OverviewCamera`, `PresentingCamera`, `PRESENTING_PADDING`, `OVERVIEW_DURATION` and `PRESENTING_DURATION` are deleted with their tests. `OVERVIEW_FIT` and `OpeningFramingCamera` (Enter's stored framing, with its tests) stay. `MAX_ZOOM` stays 16, documented as letting an author read one Resource at screen size.
- **Styles.** The canvas presented-content rules, the active outline and the `.resource`/`.resource--full`/`.resource__title` base rules are gone from `styles.css`. The one base rule the Stage still needed — a picture's name stacked over it, with overflow clipped — moved into `stage.css`, which now holds every rule `PresentedResource` is drawn by.
- **Left alone.** `SpaceCanvas` still takes `presenting` for authoring withdrawal and for not resuming an Exited embedded read on click; neither draws presenting. `docs/agents/workflow.md` still quotes the deleted `PRESENTING_DURATION` comment as a worked example of the comment rules; it illustrates the rule rather than describing presenting.
