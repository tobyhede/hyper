# 02 — Navigation has one owner

**What to build:** Give renderer selection, active Route, walk, presenting state
and opened Card to one navigation module while making the session's working
snapshot the application's sole authoritative authored Space.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The navigation module owns selected renderer, active Route, walk,
      presenting state and opened Card through one framework-neutral interface.
- [ ] The former standalone renderer-choice state and the navigation store's
      duplicate Space copy are gone.
- [ ] Selecting a View or Layout resolves its active Route and ends any walk
      without changing the authored Space.
- [ ] Activating a Route ends any walk without creating an Edit.
- [ ] Opening, closing and presenting Cards retain their existing behaviour.
- [ ] A newly authored Edge is visible to Route traversal immediately from the
      session's working Space, with no separate Space installation step.
- [ ] The selected Algorithmic View shown by the UI is derived from navigation
      state rather than owned by a second React state value.
- [ ] Focused tests cover navigation against a changing working Space, and
      existing browser navigation and presenting behaviour remains green.
- [ ] `pnpm verify` and `pnpm e2e` pass.
