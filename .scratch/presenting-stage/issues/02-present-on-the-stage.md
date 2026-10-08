# 02: Present on the Stage

**What to build:** Present draws the Active Resource on a full-window Stage over an inert canvas (ADR 0123). The Stage shows one fixed 16:9 frame, the largest that fits above the presenting chrome, letterboxed; it draws the Resource by kind through `PresentedResource`, never by its position, size, Shape or Open state. Traversal, Back, choices at a fork, Overview, Copy link and the presenting URLs behave as they do today. Leaving presenting removes the Stage and shows the canvas exactly as it was.

**Blocked by:** 01 — Withdraw authoring while presenting.

**Status:** ready-for-human — implemented and checked locally; the draft PR's `CI passed` gate has not yet been observed.

- [x] Write the new e2e assertions first and record them failing on `main`: the frame fills the space above the chrome at 16:9; a Closed, an Open and a resized Resource are framed identically; no connection handle, Resource toolbar, resize control, `textbox` or `contenteditable` is visible or reachable; the canvas behind the Stage is not focusable; an oversized image fits inside the frame; a Space Resource and an Ur Resource show their name only; a Reference Resource shows its own name over its Target's content.
- [x] Overflowing content scrolls vertically inside the frame by wheel, trackpad and Page Up or Page Down, and the arrow keys still traverse while the scroll region has focus; e2e asserts both.
- [x] A presentational `Stage` in `@project/ui` owns the letterboxed frame, the chrome strip below it and the scrolling body, takes its content and chrome as children, and sizes type in container units. It is built `$shadcn-first-ui` first and has a stable Ladle story, a Ladle test and an application proof with `@parity` claims (ADR 0052).
- [x] `app` composes the Stage with `PresentedResource`, Navigation and the unchanged presenting chrome; the canvas stays mounted and is inert while the Stage is up. The Stage is not a dialog, so the presenting keys keep working.
- [x] Leaving presenting, by Overview, Escape or the browser's Back, leaves the canvas viewport exactly as it was before Present; e2e asserts it.
- [x] The presenting e2e suite is rewritten around the Stage rather than the camera. Other specs that read presenting through the canvas, including the restart proofs under `test/e2e/`, are updated to the Stage.
- [x] The presenting and overview cameras may remain in the tree, unused by presenting, for ticket 03 to delete.
- [ ] `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm ui:catalog:check`, targeted lint and the affected unit, e2e and Ladle specs pass locally; the draft PR's `CI passed` gate is observed green before resolution. _(Local half done; CI not yet observed.)_

**Decisions taken:**

- **Red on `main`.** The rewritten `presenting.spec.ts` ran 22 failed / 0 passed against the branch before any Stage code: every test waited on the `stage` test id that did not exist yet.
- **`Stage` (`packages/ui/src/Stage.tsx`, `stage.css`)** takes `children`, `chrome`, `label` (the scroll region's accessible name) and `contentKey`. A new `contentKey` resets the body's scroll to the top without remounting it, so a long Resource does not leave the next one scrolled and the region keeps focus across a traversal. The body is a focusable `role="region"`, not a control, so `usePresentingKeys` still sees the arrows and Space; Page Up and Page Down stay native scrolling. No shadcn or Base UI primitive is a letterboxed size-container frame, and it adds no interactive behaviour beyond a focusable scroll region, so no deviation is recorded.
- **`PresentingStage` (`packages/app/src/components/PresentingStage.tsx`)** is the one composition of `Stage`, `PresentedResource` (content from `resolveResourceContent`) and the unchanged `PresentingChrome`. `App` and the Ladle fixture both mount it. `PresentingChrome` lost only its absolute positioning, now that it sits in the strip.
- **Inert canvas.** The canvas subtree in `App` is wrapped in a layer that gets the `inert` attribute while presenting, through a layout effect, because React 18 has no `inert` prop. The Command Dock stays outside that layer and above the Stage (z-index 20 over 10), so a failed save stays reported with Retry reachable while presenting (`http-persistence.spec.ts`).
- **Cameras.** `SpaceCanvas` no longer mounts `OverviewCamera` or `PresentingCamera`. Both, their constants and `cameras.test.tsx` stay for ticket 03 to delete. `SpaceCanvas`'s now-unused `activeResourceId` prop is removed.
- **Left for ticket 03.** The projection still makes the `presented` display for the active canvas node behind the inert Stage, and the canvas presented-content styles stay in `styles.css`. The Stage has its own copy of the container-unit type rules in `stage.css`.
- **Restart proofs.** `test/e2e/` does not read presenting, so nothing there changed. The specs updated to the Stage are `editing`, `image-resource`, `mobile-dock`, `new-space` and `space-routing`.
- **Parity claims.** These are new, each with a Ladle test (`ladle-e2e/stage.spec.ts`) and an application test: `stage-frames-the-largest-16-9-above-the-chrome`, `stage-scrolls-overflow-and-arrows-still-traverse`, `stage-fits-an-oversized-picture` and `stage-centres-a-title-slide`.
- **Space Resource.** Presented, it draws its name alone at the top of the frame, as before. Only an Ur Resource is centred as a title slide.
