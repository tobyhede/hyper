# 21 — Record the one SQL Space repository

**What to build:** ADR 0093 and the documents that describe the persistence design agree with it before any code moves.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Why:** The architecture review of this branch (2026-09-17) found the two SQL adapters about 79% identical and already drifting, and settled in a grilling session that they become one repository. ADR 0078 said otherwise for "a future SQLite adapter", so the refinement is recorded first.

- [x] `docs/adr/0093-sql-databases-share-one-space-repository.md`, accepted, refining 0078, with the rejected alternatives: two adapters over one procedure, typing generic over Prisma Next's contract types, one file checked under two tsconfigs, and waiting for Prisma ORM v8.
- [x] ADR 0078's status block names 0093 under `Refined by:`; `docs/adr/README.md` lists 0093 under Editing and persistence.
- [x] `CONTEXT.md` defines **Revision** and the exported revision.

Remaining document updates land with the code that makes them true: `docs/agents/editing-and-persistence.md`'s `int8` workaround bullet with ticket 22, and `AGENTS.md`'s persistence prose with ticket 24.

## Answer

Written in the same session as the review. Two findings shaped it that are not in the ADR's rejected list. Prisma ORM v8 was reviewed against 8.0.0-rc.11 source: it fixes PostgreSQL's `int8` typing and very likely SQLite's string JSON on `include`, but keeps per-database client types, SQLite's RangeError past 2^53, constraint-less SQLite unique errors, and no row-lock API, and marks SQLite experimental — so it would not have given one adapter. And Hyper cannot trigger either PostgreSQL driver defect fixed after 0.16.0: the shared-connection interleaving needs parallel statements on one pinned client, and Hyper binds a pool and awaits every statement in a transaction; the transaction-ending defect is not in 0.16.0 at all. Moving to v8 is a separate PostgreSQL-first effort after its general availability, with its own ADR and spike.
