# 01 — Route intake permits cycles and enforces Edge-set uniqueness

**What to build:** Make the domain accept every directed Route shape an author can draw while preserving the meaning of a Route as a set. Cycles and self-edges become valid; an exact duplicate Edge inside one Route becomes an intake error rather than duplicated rendered or persisted structure.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Domain intake accepts a Route containing a directed cycle.
- [x] Domain intake accepts a self-edge.
- [x] Existing fork, merge, disconnected-component and linear Route behavior remains valid.
- [x] Domain intake rejects an exact duplicate `(from, to)` Edge within one Route with a specific, actionable validation error.
- [x] The same `(from, to)` pair remains valid when it belongs to two different Routes.
- [x] Property tests cover arbitrary cyclic Routes and adding an exact duplicate to an otherwise valid Route.
- [x] Tests and comments no longer teach acyclicity or require an Alias merely to return to an existing Card.
- [ ] `pnpm verify` passes. Full verification passes both typecheck layers, but repository-wide lint is blocked by the pre-existing untracked `design_handoff_toolbar_view_selector/support.js`; focused lint, format and coverage are green.
- [x] `pnpm e2e` passes unchanged, proving existing rendering and presenting still tolerate the accepted fixture behavior.

## Answer

`loadSpace`'s public validation seam now accepts cyclic Routes, disconnected
cycles and self-edges. The former cycle search and `route-has-cycle` error are
gone. Intake instead reports `duplicate-route-edge` when one Route repeats the
same ordered Card pair, including both occurrence indices; a matching Edge in a
different Route remains valid.

The change was driven test-first at the public validator seam. Focused example
and property tests passed 35 cases; the full coverage run passed 361 tests and
the Playwright suite passed all 33 tests. Directly stale schema, traversal,
adapter, fixture and example language now describes cyclic Routes and Alias's
remaining content-reuse role.
