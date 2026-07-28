# 04 — PostgreSQL space repository

**What to build:** Implement the server-side `SpaceRepository` so a completely identified space can be stored and reloaded as one revisioned aggregate using the PostgreSQL relational spine and JSONB documents.

**Blocked by:** 01 — Version 2 UUID migration; 03 — Prisma Next PostgreSQL foundation.

**Status:** ready-for-agent

- [ ] A committed snapshot writes the space document and all card documents in one callback transaction.
- [ ] Space and card UUIDs live in relational columns and are not duplicated inside their JSONB documents.
- [ ] Updating any part of the aggregate increments the owning space revision in the same transaction.
- [ ] A commit succeeds only when its expected revision matches the stored revision.
- [ ] A stale expected revision returns a typed conflict and changes no data.
- [ ] The repository commit result contains only committed, revision-conflict, invalid-snapshot, and not-found outcomes; it contains no HTTP, browser, authorization, network, timeout, protocol, or rate-limit concepts.
- [ ] Database availability and unexpected operational failures leave the transaction rolled back and propagate to the calling handler for transport classification.
- [ ] Loading reconstructs a complete snapshot and its revision/export metadata, then passes through the normal domain validation intake.
- [ ] Listing derives stable space summaries without introducing speculative duplicated columns or JSONB indexes.
- [ ] Card UUIDs already owned by another space are rejected rather than moved implicitly.
- [ ] A runtime commit treats its complete snapshot as authoritative and deletes cards owned by the space but absent from that snapshot in the same transaction.
- [ ] Ordinary upsert import remains additive and never deletes database cards merely because they are absent from the import input.
- [ ] Integration tests against Docker PostgreSQL cover atomic commits, rollback, stale revisions, listing, loading, ownership conflicts, authoritative runtime deletion, and non-deleting upsert import.
