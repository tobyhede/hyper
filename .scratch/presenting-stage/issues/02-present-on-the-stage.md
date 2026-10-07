# 02: Present on the Stage

**What to build:** Present draws the Active Resource on a full-window Stage over an inert canvas (ADR 0123). The Stage shows one fixed 16:9 frame, the largest that fits above the presenting chrome, letterboxed; it draws the Resource by kind through `PresentedResource`, never by its position, size, Shape or Open state. Traversal, Back, choices at a fork, Overview, Copy link and the presenting URLs behave as they do today. Leaving presenting removes the Stage and shows the canvas exactly as it was.

**Blocked by:** 01 — Withdraw authoring while presenting.

**Status:** ready-for-agent

- [ ] Write the new e2e assertions first and record them failing on `main`: the frame fills the space above the chrome at 16:9; a Closed, an Open and a resized Resource are framed identically; no connection handle, Resource toolbar, resize control, `textbox` or `contenteditable` is visible or reachable; the canvas behind the Stage is not focusable; an oversized image fits inside the frame; a Space Resource and an Ur Resource show their name only; a Reference Resource shows its own name over its Target's content.
- [ ] Overflowing content scrolls vertically inside the frame by wheel, trackpad and Page Up or Page Down, and the arrow keys still traverse while the scroll region has focus; e2e asserts both.
- [ ] A presentational `Stage` in `@project/ui` owns the letterboxed frame, the chrome strip below it and the scrolling body, takes its content and chrome as children, and sizes type in container units. It is built `$shadcn-first-ui` first and has a stable Ladle story, a Ladle test and an application proof with `@parity` claims (ADR 0052).
- [ ] `app` composes the Stage with `PresentedResource`, Navigation and the unchanged presenting chrome; the canvas stays mounted and is inert while the Stage is up. The Stage is not a dialog, so the presenting keys keep working.
- [ ] Leaving presenting, by Overview, Escape or the browser's Back, leaves the canvas viewport exactly as it was before Present; e2e asserts it.
- [ ] The presenting e2e suite is rewritten around the Stage rather than the camera. Other specs that read presenting through the canvas, including the restart proofs under `test/e2e/`, are updated to the Stage.
- [ ] The presenting and overview cameras may remain in the tree, unused by presenting, for ticket 03 to delete.
- [ ] `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm ui:catalog:check`, targeted lint and the affected unit, e2e and Ladle specs pass locally; the draft PR's `CI passed` gate is observed green before resolution.
