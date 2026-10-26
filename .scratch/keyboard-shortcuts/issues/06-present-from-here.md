# 06: Present from here

Status: resolved

**What to build:** `P` on a selected Resource in the Active Graph starts presenting there (`navigation.openPresentation`). Off the Active Graph it does nothing, and the Actions-menu item is disabled with the reason.

**Acceptance:** Playwright: P on a mid-Graph Resource presents it and ← goes nowhere (fresh history).



## Answer

`Navigation.presentFrom` (`packages/app/src/navigation.ts`) starts presenting with a Traversal history of that one Resource when the Active Graph holds it, and does nothing otherwise. `presentingFullscreen` and `presentingWindow` carry it with the same fullscreen request and restart handling as Present. `P` (`CANVAS_KEYS.presentFromHere`) is answered on the window by `SpaceCanvas`, for the selected Resource of the canvas's own Map, while `present` is available, and leaves the key alone when nothing selected is on the Active Graph. The Resource's Actions menu offers Present from Here in its own group after Connect to Resource, drawn unavailable with `PRESENT_OFF_GRAPH` off the Active Graph. Proved by `packages/app/e2e/keyboard-shortcuts.spec.ts` (P and the menu item, with no Back control at the start).

Not done: a Map drawn inside a Space Resource offers neither, since nothing presents it.
