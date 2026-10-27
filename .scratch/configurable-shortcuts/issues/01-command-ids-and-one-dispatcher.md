# 01: Command ids and one dispatcher

Status: ready-for-agent

ADR 0138. No behaviour changes: every key does what it does today.

**What to build.** Give each binding in `key-bindings.ts` a stable command id (`canvas.addResource`, `canvas.presentFromHere`, `presenting.advance`, `help.showShortcuts`, …) and a context: the canvas, Full View, presenting, or everywhere. Replace the canvas's four window `keydown` listeners (`SpaceCanvas.tsx`: `C`, `P`, `F2`, Delete) and the `?` sheet's capture-phase listener with one dispatcher per Space. It reads each press once, applies `keyBelongsElsewhere` once, finds the binding for the Space's current context, and runs the command registered for that id. Commands register a handler and an availability check (today's per-listener guards, such as `availability.present` and `spaceOnCanvas`); they never add a listener. The presenting keys move under the same dispatcher.

**Keep.** The sheet still listens in the capture phase, because Full View stops every key pressed in it. A hidden open Space answers nothing, which is the bug #426 fixed for `P` (`SpaceApp.test.tsx`, "the P shortcut across open Spaces"). While Full View is shown, the canvas context answers nothing: today `C`, `P` and `F2` each check `latestFullViewShown` themselves (#427 review), and the dispatcher's context replaces those checks, so a command added later cannot act on the hidden Map.

**Done when.** A test lists every window `keydown` listener the app adds and finds the dispatcher's alone. The existing key tests and `packages/app/e2e/keyboard-shortcuts.spec.ts` pass unchanged. Each command id appears in exactly one binding.
