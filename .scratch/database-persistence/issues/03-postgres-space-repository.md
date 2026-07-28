# 03 — PostgreSQL space repository

**What to build:** Implement the server-side `SpaceRepository` so a completely identified space can be stored and reloaded as one revisioned aggregate using the PostgreSQL relational spine and JSONB documents.

**Blocked by:** 02 — Prisma Next PostgreSQL foundation.

**Status:** ready-for-agent

- [ ] A committed snapshot writes the space document and all card documents in one callback transaction.
- [ ] Space and card UUIDs live in relational columns and are not duplicated inside their JSONB documents.
- [ ] Updating any part of the aggregate increments the owning space revision in the same transaction.
- [ ] A commit succeeds only when its expected revision matches the stored revision.
- [ ] A stale expected revision returns a typed conflict and changes no data.
- [ ] Loading reconstructs a complete snapshot and its revision/export metadata, then passes through the normal domain validation intake.
- [ ] Listing derives stable space summaries without introducing speculative duplicated columns or JSONB indexes.
- [ ] Card UUIDs already owned by another space are rejected rather than moved implicitly.
- [ ] Deleting by omission is not part of the repository commit contract.
- [ ] Integration tests against Docker PostgreSQL cover atomic commits, rollback, stale revisions, listing, loading, and ownership conflicts.

