# 07: One listener answers every key

**What to build:** The `?` sheet's key joins the dispatcher, which registers it in the capture phase so it works from inside Full View (the dispatcher keeps one window listener per phase), and still answered while presenting. With 03–06 done, no command adds a listener of its own. This ticket adds the guard that keeps it that way, and closes ADR 0138's ticket 01 done-when. Configurable-shortcuts tickets 02 onward build on this.

**Blocked by:** 03, 04, 05, 06.

**Status:** ready-for-agent

- [ ] A test lists every window `keydown` listener the app adds and finds only the dispatcher's, apart from React Flow's `useKeyPress` and Edge Authoring's Alt tracker, which answer no command and are named in the test.
- [ ] A test checks that each command id appears in exactly one binding (per id: one key may serve ids in different contexts), and that the bindings React Flow performs (nudge, unselect) have no command id.
- [ ] `?` opens the sheet from the canvas, from Full View and while presenting, and the sheet lists every binding with the description its rail item shows.
- [ ] The full key test suite, `packages/app/e2e/keyboard-shortcuts.spec.ts` and the keyboard-shortcuts Ladle spec pass.
