# 08 — HTTP-backed automatic persistence

**What to build:** Connect the browser's existing `SpaceBackend` contract to `SpaceRepository` over HTTP so normal app edits are automatically durable in PostgreSQL with honest pending, conflict, failure, and retry behavior.

**Blocked by:** 01 — Memory-backed automatic persistence; 03 — PostgreSQL space repository; 04 — Version 2 UUID migration.

**Status:** ready-for-agent

- [ ] `HttpSpaceBackend` passes the same behavioral contract suite as `MemorySpaceBackend`.
- [ ] HTTP handlers translate list, load, and revision-checked commit requests without duplicating repository validation or transaction rules.
- [ ] Request bodies are bounded and validated before reaching the repository.
- [ ] Browser requests cannot name database connections, filesystem paths, or arbitrary storage targets.
- [ ] The normal app runtime uses `HttpSpaceBackend`; the memory implementation remains available for isolated UX development and tests.
- [ ] Edits remain optimistic and are committed in order per space.
- [ ] Successful commits install the returned revision; stale commits and transport/database failures remain visible and retryable.
- [ ] Navigation protection is present only for pending or failed persistence.
- [ ] The old Vite virtual-space loader, file-save endpoint, read-only save mode, and Save-specific tests are removed once no longer referenced.
- [ ] Application and end-to-end tests prove durability across a reload, ordered rapid edits, conflict reporting, failure retry, and unchanged route-activation behavior.

