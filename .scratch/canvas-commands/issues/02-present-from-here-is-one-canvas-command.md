# 02: Present from Here is one Canvas command

**What to build:** The tracer bullet. Present from Here becomes the first Canvas command (`canvas.presentFromHere`, aim *selection*, serves the *own Map*), and one dispatcher per Space answers its key, `P`. The rail's Present from Here item reads the same command: when the command answers *unavailable*, the item is greyed out with that reason ("This Resource is not on the Active Graph." or "Finish the edit in progress to present."), and when it answers *absent*, the item is not offered. `P` runs only when the command is *available*. Otherwise it stays silent and leaves the press alone. The canvas builds the command and hands it to the rail builder, replacing the rail's separate present field. The canvas's own `P` listener is removed.

The dispatcher answers canvas commands only for the Space on screen, while it is not presenting and while no Full View is shown. It picks its guard from the command's aim.

**Blocked by:** The keyboard-shortcuts stack (#427–#430) merged; 01.

**Status:** ready-for-agent

- [ ] A test asks the command for availability and runs it on a composed Space, without a keydown.
- [ ] A test shows the key and the rail item agree: both refuse while an edit is in progress, and both refuse off the Active Graph with the reason.
- [ ] `SpaceApp.test.tsx`'s "the P shortcut across open Spaces" passes unchanged.
- [ ] `P` does nothing while Full View is shown, and Present from Here no longer checks Full View for itself.
- [ ] The existing `P` key tests and `packages/app/e2e/keyboard-shortcuts.spec.ts` pass unchanged.
