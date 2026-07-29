# 04 — PostgreSQL space repository

**What to build:** Implement the server-side `SpaceRepository` so a completely identified space can be stored and reloaded as one revisioned aggregate using the PostgreSQL relational spine and JSONB documents.

**Blocked by:** 01 — Version 2 UUID migration; 03 — Prisma Next PostgreSQL foundation.

**Status:** resolved

- [x] A committed snapshot writes the space document and all card documents in one callback transaction.
- [x] Space and card UUIDs live in relational columns and are not duplicated inside their JSONB documents.
- [x] Updating any part of the aggregate increments the owning space revision in the same transaction.
- [x] A commit succeeds only when its expected revision matches the stored revision.
- [x] A stale expected revision returns a typed conflict and changes no data.
- [x] The repository commit result contains only committed, revision-conflict, invalid-snapshot, and not-found outcomes; it contains no HTTP, browser, authorization, network, timeout, protocol, or rate-limit concepts.
- [x] Database availability and unexpected operational failures leave the transaction rolled back and propagate to the calling handler for transport classification.
- [x] Loading reconstructs a complete snapshot and its revision/export metadata, then passes through the normal domain validation intake.
- [x] Listing derives stable space summaries without introducing speculative duplicated columns or JSONB indexes.
- [x] Card UUIDs already owned by another space are rejected rather than moved implicitly.
- [x] A runtime commit treats its complete snapshot as authoritative and deletes cards owned by the space but absent from that snapshot in the same transaction.
- [x] Ordinary upsert import remains additive and never deletes database cards merely because they are absent from the import input.
- [x] Integration tests against Docker PostgreSQL cover atomic commits, rollback, stale revisions, listing, loading, ownership conflicts, authoritative runtime deletion, and non-deleting upsert import.

## Answer

Implemented a server-only `SpaceRepository` and Prisma Next-backed
`PostgresSpaceRepository`. Repository mutations validate complete snapshots,
reject duplicate durable identities, run in callback transactions, preserve
card ownership, keep import additive, and expose only storage/domain outcomes.
Revision-stabilised reads prevent a concurrent commit from producing a torn
space/card aggregate. PostgreSQL revisions remain lossless `bigint` values
behind an isolated Prisma Next 0.16.0 compatibility cast. The integration suite
covers eleven repository behaviours against PostgreSQL.
