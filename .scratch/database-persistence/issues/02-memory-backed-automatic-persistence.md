# 02 — Memory-backed automatic persistence

**What to build:** Put the running app behind `SpaceSession` and make edits persist automatically through an asynchronous in-memory backend, so UX work can continue without the old file Save flow or a running database.

**Blocked by:** 01 — Version 2 UUID migration.

**Status:** ready-for-agent

- [ ] The browser-safe persistence package owns `SpaceBackend`, `SpaceSession`, `MemorySpaceBackend`, and their behavioral tests without importing React, Node, or storage-specific code.
- [ ] The app lists and loads spaces through `SpaceSession`, without importing a singleton space directly from the Vite virtual module.
- [ ] `MemorySpaceBackend` implements the same asynchronous list, load, and revision-checked commit contract intended for the HTTP implementation.
- [ ] The memory adapter remains a supported development and test mode after PostgreSQL integration, with test-only latency and failure controls kept outside the production interface.
- [ ] A completed edit updates the UI optimistically and enters a per-space session with at most one commit in flight.
- [ ] Multiple edits behind an in-flight commit coalesce to the latest complete valid snapshot, which commits against the newly acknowledged revision.
- [ ] A successful commit advances the acknowledged revision; a transient failure remains visible and retryable.
- [ ] A revision conflict remains visible and cannot blindly overwrite current database state.
- [ ] The Save button, Save keyboard shortcut, and file-save request are removed.
- [ ] Route activation remains a reading choice and does not commit by itself.
- [ ] Navigation protection applies only while a commit is pending or failed.
- [ ] Behavioral tests pin both the backend interface and session coordination, including ordered commits, coalescing, retry, and conflict handling.
- [ ] Existing graph and presentation behavior remains unchanged in Playwright.
