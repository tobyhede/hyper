# 03 — Prisma Next PostgreSQL foundation

**What to build:** Establish a reproducible local PostgreSQL and Prisma Next foundation that can create, migrate, and exercise Hyper's document-oriented database without changing the app's runtime persistence yet.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Hyper requires Node 24 or newer everywhere the repository declares or provisions Node.
- [x] Prisma Next and `@prisma-next/postgres` are pinned together at version `0.16.0`.
- [x] The project-local Prisma Next skill cluster is installed from the matching `0.16.0` Git tag and its guidance is followed.
- [x] Docker Compose starts a pinned PostgreSQL image on a loopback-only port, with a health check and named data volume.
- [x] Locally, `DATABASE_URL` loads from an ignored `.env` copied from a credential-free `.env.example`; deployed environments can inject it directly.
- [x] One Prisma Next contract declares UUID-primary-key `spaces` and `cards` tables with JSONB documents, revision metadata, timestamps, and the card-to-space foreign key.
- [x] Contract artifacts are emitted explicitly and a versioned migration creates the schema.
- [x] Application code imports database capabilities only through the `@prisma-next/postgres` facade and one adjacent database entry point.
- [x] A repeatable smoke test proves a migrated Docker PostgreSQL accepts a typed write and read.
- [x] The normal verification workflow remains runnable when PostgreSQL is not required by a test.

## Answer

Hyper now has a pinned PostgreSQL 17.5 and Prisma Next 0.16.0 foundation: a
UUID/JSONB contract, formal initial migration, typed runtime entry, explicit
contract emission and an isolated real-database integration test. Local
credentials live in ignored `.env`; the committed template contains none.
Normal verification remains database-independent.
