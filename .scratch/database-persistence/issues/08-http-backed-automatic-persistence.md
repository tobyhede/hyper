# 08 — HTTP-backed automatic persistence

**What to build:** Connect the browser's existing `SpaceBackend` contract to `SpaceRepository` over HTTP so normal app edits are automatically durable in PostgreSQL with honest pending, conflict, failure, and retry behavior.

**Blocked by:** 02 — Memory-backed automatic persistence; 04 — PostgreSQL space repository.

**Status:** ready-for-agent

- [ ] `HttpSpaceBackend` passes the same behavioral contract suite as `MemorySpaceBackend`.
- [ ] HTTP handlers translate list, load, and revision-checked commit requests without duplicating repository validation or transaction rules, mapping the narrower repository result into HTTP outcomes.
- [ ] Request bodies are bounded and validated before reaching the repository.
- [ ] Browser requests cannot name database connections, filesystem paths, or arbitrary storage targets.
- [ ] The browser-facing commit result distinguishes success with revision, conflict with current stored state, retryable failure, and permanent failure without leaking those transport classifications into `SpaceRepository`.
- [ ] HTTP maps `200` to success; `409` to conflict; `400`, malformed responses, `401`, `403`, `404`, and `422` to the corresponding permanent failure; and `408`, `429`, `5xx`, timeouts, and network failures to retryable failure.
- [ ] The normal app runtime uses `HttpSpaceBackend`; the memory implementation remains available for isolated UX development and tests.
- [ ] Edits remain optimistic and are committed in order per space.
- [ ] Successful commits install the returned revision; only failures classified as retryable offer retry, and the session never retries automatically.
- [ ] A stale commit becomes a visible conflict and cannot blindly overwrite current database state.
- [ ] Navigation protection is present only for pending, failed, rejected, or conflicted persistence.
- [ ] The old Vite virtual-space loader, file-save endpoint, read-only save mode, and Save-specific tests are removed once no longer referenced.
- [ ] Application and end-to-end tests prove durability across a reload, ordered rapid edits, conflict reporting, failure retry, and unchanged route-activation behavior.
