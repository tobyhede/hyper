# 01 — Memory-backed automatic persistence

**What to build:** Put the running app behind the asynchronous `SpaceBackend` seam and make edits persist automatically through an in-memory implementation, so UX work can continue without the old file Save flow or a running database.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The app lists and loads spaces exclusively through `SpaceBackend`, without importing a singleton space directly from the Vite virtual module.
- [ ] `MemorySpaceBackend` implements the same asynchronous list, load, and revision-checked commit contract intended for the HTTP implementation.
- [ ] A completed edit updates the UI optimistically and enters a per-space ordered commit queue.
- [ ] A successful commit advances the acknowledged revision; a failed or stale commit remains visible and retryable.
- [ ] The Save button, Save keyboard shortcut, and file-save request are removed.
- [ ] Route activation remains a reading choice and does not commit by itself.
- [ ] Navigation protection applies only while a commit is pending or failed.
- [ ] A shared behavioral test suite pins the backend contract against `MemorySpaceBackend`.
- [ ] Existing graph and presentation behavior remains unchanged in Playwright.

