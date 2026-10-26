# 08: Presenting answers clicker keys

Status: resolved

**What to build:** While presenting, `PageDown` advances, `PageUp` retreats and `Home` returns to the Graph's start. Add them to the Notes window's key line and the presenting chrome.

**Acceptance:** unit test over `usePresentingKeys`; Playwright with PageDown.



## Answer

`PRESENTING_KEYS.advance` takes Page Down and `retreat` takes Page Up; `returnToStart` is Home, which runs Navigation's own Present inside the same presentation, so Traversal history starts again with nothing to go back to and the Notes timer keeps counting. `usePresentingKeys` leaves Page Down or Page Up to the content it lands in while that content still scrolls that way (`pageScrollsContent`), so a reader paging a long Resource with the Stage body focused reads to its end first, as `presenting.spec.ts`'s overflow claim holds, and a clicker, whose focus is on the chrome after a move, goes straight on. The presenting chrome's guidance draws `→ PgDn go`, `← PgUp back` and `Home start`, and the Notes window's key line draws Page Down and Page Up. Proved by `packages/app/test/presenting-keys.test.tsx` and `packages/app/e2e/keyboard-shortcuts.spec.ts`.

Not done: Home in a Notes window does nothing, because the window's channel to the presenting window carries no such command.
