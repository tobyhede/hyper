# 03 — Connecting from an Algorithmic View converts atomically

**What to build:** Make the existing-Card connection gesture available directly in every Algorithmic View. The first successful structural Edit freezes exactly the arrangement on screen into the next positioned Layout, applies the Edge there, selects it and persists one whole snapshot without moving any Card.

**Blocked by:** 02 — Connect existing Cards in a positioned Layout.

**Status:** ready-for-agent

- [ ] Graph and Grid expose the same contextual source and target handles as a positioned Layout once their arrangements resolve.
- [ ] Starting or cancelling a connection does not convert the Algorithmic View.
- [ ] Completing an existing-Card connection copies every resolved Card position already on screen into the next uniquely titled `Layout N`.
- [ ] The new Edge and positioned Layout are composed into one complete next Space snapshot.
- [ ] The created Layout is selected immediately, becomes `defaultView`, and names the active Route explicitly.
- [ ] Existing Layouts and unrelated Space content remain unchanged.
- [ ] No Card moves at conversion; the Edge is the only visible authored change.
- [ ] Obsolete asynchronous strategy results cannot replace the converted Layout after the completed structural Edit.
- [ ] The completed Edit advances one revision and submits one snapshot through the existing session.
- [ ] Pure tests cover Graph and Grid conversion, next-Layout naming, resolved-position copying and unrelated-Layout preservation.
- [ ] Playwright connects two Cards directly from both an Algorithmic View and verifies Layout selection, stable positions and automatic persistence.
- [ ] `pnpm verify` and `pnpm e2e` pass.
