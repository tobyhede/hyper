# 04: Full-viewport reading view

Status: resolved

**What to build:** `Space` on a selected Resource shows its content filling the canvas area, Dock floating over it. Transient: no Edit, no URL, camera unchanged. Read-only; Tab and arrows walk the Active Graph inside it; `Space`/`Esc` leave; `Enter` leaves and Opens on the canvas. Also an Actions-menu item. Replaces `Space` as a second Open key. Start with the `shadcn-first-ui` skill.

**Acceptance:** Playwright: enter, walk, leave, and the Map's revision is unchanged.



## Answer

Built as Full View. `Space` (`CANVAS_KEYS.showFullView`) on a focused Resource of the canvas's own Map, or Read in Full View in its Actions menu, draws `FullView` (`packages/app/src/components/FullView.tsx`). It composes the presenting `Stage` and `PresentedResource` from `@project/ui`, so a Resource reads as it will be presented, letterboxed at 16:9 in the canvas area, with the Dock floating above. The state is `App`'s alone and transient. `SpaceCanvas` answers its keys (`FULL_VIEW_KEYS`): Tab, Shift+Tab and the arrows on the content go along the Active Graph and select as they go; Space and Escape leave to the Resource last read; Enter leaves and Opens it. Space is no longer an Open key. Proved by `packages/app/e2e/keyboard-shortcuts.spec.ts` (revision unchanged until the Open) and the Full View tests in `packages/app/test/SpaceCanvas.test.tsx`.

Not done: Full View is a 16:9 frame rather than the whole canvas area, because it reuses the Stage; and a Map drawn inside a Space Resource has none.
