# 02 — Memory-backed automatic persistence

**What to build:** Put the running app behind `SpaceSession` and make edits persist automatically through an asynchronous in-memory backend, so UX work can continue without the old file Save flow or a running database.

**Blocked by:** 01 — Version 2 UUID migration.

**Status:** resolved

- [x] The browser-safe persistence package owns `SpaceBackend`, `SpaceSession`, `MemorySpaceBackend`, and their behavioral tests without importing React, Node, or storage-specific code.
- [x] App bootstrap lists and loads spaces directly through `SpaceBackend`, then constructs an already-open session from the backend and loaded space; catalog concerns do not enlarge the session interface.
- [x] The app no longer imports a singleton space directly from the Vite virtual module.
- [x] `MemorySpaceBackend` implements the same asynchronous list, load, and revision-checked commit contract intended for the HTTP implementation.
- [x] The memory adapter remains a supported development and test mode after PostgreSQL integration, with test-only latency and failure controls kept outside the production interface.
- [x] A completed edit updates the UI optimistically and enters a per-space session with at most one commit in flight.
- [x] Multiple edits behind an in-flight commit coalesce to the latest complete valid snapshot, which commits against the newly acknowledged revision.
- [x] A successful commit advances the acknowledged revision; a transient failure retains the latest working snapshot and retry submits that snapshot against the last acknowledged revision.
- [x] A permanent failure retains local work, disables retry, and allows a later valid edit to submit again.
- [x] A revision conflict retains both the latest local snapshot and the returned current database snapshot, stops automatic commits, and cannot blindly overwrite current database state.
- [x] Conflict recovery either explicitly accepts the remote snapshot or submits a complete snapshot explicitly reconciled by the UX against the returned current revision.
- [x] Session state exposes `changedSinceExport`, derived from acknowledged and exported database revisions; a never-exported space reports changed, and pending work affects the status only after commit.
- [x] The Save button, Save keyboard shortcut, and file-save request are removed.
- [x] Route activation remains a reading choice and does not commit by itself.
- [x] Navigation protection applies while persistence is pending, failed, rejected, or conflicted, and is absent when persistence is settled.
- [x] Behavioral tests pin the discriminated commit results and every session transition, including ordered commits, coalescing, latest-snapshot retry, permanent rejection, and conflict recovery.
- [x] Existing graph and presentation behavior remains unchanged in Playwright.

## Answer

The app now opens imported files through the asynchronous memory backend and an already-open `SpaceSession`. Completed edits submit whole snapshots automatically; the session serializes commits, coalesces waiting work, advances revisions, and exposes retry, rejection, conflict recovery, export status, and navigation protection without restoring a Save flow. Persistence and application tests pin those transitions, while Playwright keeps graph editing, presentation, and import files unchanged.
