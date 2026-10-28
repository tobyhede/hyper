# 08: Presenting answers clicker keys

Status: resolved

**What to build:** While presenting, `PageDown` advances, `PageUp` retreats and `Home` returns to the Graph's start. Add them to the Notes window's key line and the presenting chrome.

**Acceptance:** unit test over `usePresentingKeys`; Playwright with PageDown.



## Answer

`PRESENTING_KEYS.advance` takes Page Down and `retreat` takes Page Up; `returnToStart` is Home, which runs Navigation's `returnToStart`: it goes back to the first Resource of Traversal history, where this presentation began (the Graph's start after Present, the chosen Resource after Present from Here), with the Edge first taken selected. It is a move inside the presentation, not a restart, so the presentation, its clock and its rehearsal notes go on, as they do on Back. `usePresentingKeys` leaves Page Down, Page Up or Home to the content the press lands in while any scrolling ancestor of it still scrolls that way (`keyScrollsContent`), nearest first, so a reader paging a long Resource with the Stage body focused reads to its end first, as `presenting.spec.ts`'s overflow claim holds, and a clicker, whose focus is on the chrome after a move, goes straight on. The presenting chrome's guidance draws `→ PgDn go`, `← PgUp back` and `Home start` whenever Back can, and the Notes window's key line draws all three; a Notes window sends Home over the presentation channel as `return-to-start`. Proved by `packages/app/test/presenting-keys.test.tsx`, `navigation.test.ts`, `presenting-window.test.ts`, `presentation-link.test.ts` and `packages/app/e2e/keyboard-shortcuts.spec.ts`.
