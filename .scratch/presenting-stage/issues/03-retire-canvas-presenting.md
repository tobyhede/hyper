# 03: Retire canvas presenting

**What to build:** Nothing on the canvas knows about presenting any more. A canvas Resource is only Closed or Open, and the camera machinery that framed a presented Resource is gone, so canvas presenting does not linger dormant behind the Stage.

**Blocked by:** 02 — Present on the Stage.

**Status:** ready-for-agent

- [ ] The projection's presented display and the option that asked for it are deleted; a canvas node's display is Closed or Open, and every test fixture that set the option is updated.
- [ ] The presenting and overview cameras, the presenting padding and both camera durations are deleted with their tests. The overview fit constant stays, because it frames a Map when the canvas opens.
- [ ] The canvas presented-content styles and the active-Resource outline are deleted, with their design-system inventory entries; the container-unit type rules live on the Stage.
- [ ] The zoom ceiling stays at 16, and its doc comment gives the authoring reason instead of the presenting one.
- [ ] The root README's presenting prose and its known-limitation line about camera rasterisation, and the rendering guide's camera presenting section, describe the Stage.
- [ ] `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm ui:catalog:check`, targeted lint and the affected unit, e2e and Ladle specs pass locally; the draft PR's `CI passed` gate is observed green before resolution.
