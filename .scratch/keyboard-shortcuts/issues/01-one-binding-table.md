# 01: One binding table, and canvas keys answer wherever focus is

Status: resolved

**What to build:** Declare every existing shortcut (canvas, editing, presenting) in one table in `app`: key, modifiers, mode, the command it runs and its label. Rebuild the canvas handlers (`C`, `Enter`, `F2`, `Delete`/`Backspace`) and `usePresentingKeys` over it with one shared guard for modifiers, repeats, text controls, menus and dialogs. Canvas keys answer anywhere outside those, so `C` works after a click on the Dock. Controls that perform a shortcut announce it with `aria-keyshortcuts` read from the table. Remove the `SpaceCanvas.tsx` comment claiming the toolbar announces `C`.

**Acceptance:** no behaviour change except scope; one test proves every table entry's key reaches its command and every guard holds; `C` after clicking the Dock adds a Resource.


## Answer

`packages/app/src/key-bindings.ts` declares `CANVAS_KEYS` and `PRESENTING_KEYS`, matches presses with `pressesBinding`, and shares one guard, `keyBelongsElsewhere`. `C`, `F2` and every presenting key go through it, while `Enter`/`Space` (Open) and `Delete`/`Backspace` keep `SpaceCanvas`'s narrower guard, which honours `.nokey`; and the presenting chrome takes its `aria-keyshortcuts` from the table. `C` now listens on the window, so it works while a Dock button or the canvas's Zoom out has focus (`packages/app/e2e/keyboard-shortcuts.spec.ts`).

Two deviations from the spec:

- **Delete and Backspace stay aimed at the canvas.** Removing a Resource from a Map and deleting an Edge cannot be undone, so those keys keep their old guard: never from a control, never from the chrome. Revisit when issue 09 (Undo) lands.
- **Shift+S and Shift+N no longer act while presenting.** Every plain binding now refuses Shift, as `C` already did, so `aria-keyshortcuts="S"` means what ARIA says. Caps Lock still works.

Not done here: the Open Markdown Resource's Save and Cancel stay in `@project/ui`, which cannot import the table. Issue 07 lists them in the `?` sheet.
