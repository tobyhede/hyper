# 02 — Navigation has one owner

**What to build:** Give renderer selection, active Route, walk, presenting state
and opened Card to one navigation module while making the session's working
snapshot the application's sole authoritative authored Space.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The navigation module owns selected renderer, active Route, walk,
      presenting state and opened Card through one framework-neutral interface.
- [x] The former standalone renderer-choice state and the navigation store's
      duplicate Space copy are gone.
- [x] Selecting a View or Layout resolves its active Route and ends any walk
      without changing the authored Space.
- [x] Activating a Route ends any walk without creating an Edit.
- [x] Opening, closing and presenting Cards retain their existing behaviour.
- [x] A newly authored Edge is visible to Route traversal immediately from the
      session's working Space, with no separate Space installation step.
- [x] The selected Algorithmic View shown by the UI is derived from navigation
      state rather than owned by a second React state value.
- [x] Focused tests cover navigation against a changing working Space, and
      existing browser navigation and presenting behaviour remains green.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Implemented by PR #13. The framework-neutral Navigation module owns renderer
selection, active Route, traversal, presenting state and the opened Card while
reading the session's live working Space. The duplicate Space and renderer
state are gone, and focused plus browser coverage verifies the resulting flow.
