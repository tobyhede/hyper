# 03 — Connecting from an Algorithmic View converts atomically

**What to build:** Make the existing-Card connection gesture available directly in every Algorithmic View. The first successful structural Edit freezes exactly the arrangement on screen into the next positioned Layout, applies the Edge there, selects it and persists one whole snapshot without moving any Card.

**Blocked by:** 02 — Connect existing Cards in a positioned Layout.

**Status:** resolved

- [x] Graph and Grid expose the same contextual source and target handles as a positioned Layout once their arrangements resolve.
- [x] Starting or cancelling a connection does not convert the Algorithmic View.
- [x] Completing an existing-Card connection copies every resolved Card position already on screen into the next uniquely titled `Layout N`.
- [x] The new Edge and positioned Layout are composed into one complete next Space snapshot.
- [x] The created Layout is selected immediately, becomes `defaultView`, and names the active Route explicitly.
- [x] Existing Layouts and unrelated Space content remain unchanged.
- [x] No Card moves at conversion; the Edge is the only visible authored change.
- [x] Obsolete asynchronous strategy results cannot replace the converted Layout after the completed structural Edit.
- [x] The completed Edit advances one revision and submits one snapshot through the existing session.
- [x] Pure tests cover Graph and Grid conversion, next-Layout naming, resolved-position copying and unrelated-Layout preservation.
- [x] Playwright connects two Cards directly from both an Algorithmic View and verifies Layout selection, stable positions and automatic persistence.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Existing-Card Route authoring now works directly from both Graph and Grid. A
successful connection freezes every resolved Card position into the next
`Layout N`, adds the Edge, records the active Route, selects the Layout and
submits one complete snapshot. Cancellation and duplicate Edges remain no-ops.

The editor installs the resolved positions and declared handle geometry before
the new Edge becomes visible, so conversion neither moves Cards nor relies on a
DOM remeasurement. Existing stale-strategy coverage proves a late automatic
result cannot replace the positioned rendering. Public composition tests pass
for Graph and Grid, the browser test exercises both Views, `pnpm verify` passes
all 436 tests, and `pnpm e2e` passes all 41 tests.
