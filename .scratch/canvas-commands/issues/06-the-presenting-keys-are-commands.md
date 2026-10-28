# 06: The presenting keys are commands

**What to build:** The Traversal keys (advance, retreat, return to start, previous and next branch, stop presenting, open Notes, toggle notes) become commands with ADR 0138 ids, in a module beside the Canvas commands, with the same interface, no target and the presenting context. The dispatcher answers them only while the Space on screen is presenting, and the presenting keys hook's own window listener is removed. PageDown and PageUp keep their rule that a long Resource scrolls before the talk moves, now expressed as the advance and retreat commands' availability for that press.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] `presenting-keys.test.tsx`, `packages/app/e2e/presenting.spec.ts` and the presenting chrome Ladle spec pass unchanged.
- [ ] Space on a focused chrome control still activates that control once, not the control plus advance.
- [ ] A Space that is open but not on screen answers no presenting key.
