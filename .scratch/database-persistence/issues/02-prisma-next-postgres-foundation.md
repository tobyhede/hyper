# 02 — Prisma Next PostgreSQL foundation

**What to build:** Establish a reproducible local PostgreSQL and Prisma Next foundation that can create, migrate, and exercise Hyper's document-oriented database without changing the app's runtime persistence yet.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Hyper requires Node 24 or newer everywhere the repository declares or provisions Node.
- [ ] Prisma Next and `@prisma-next/postgres` are pinned together at version `0.16.0`.
- [ ] The project-local Prisma Next skill cluster is installed from the matching `0.16.0` Git tag and its guidance is followed.
- [ ] Docker Compose starts a pinned PostgreSQL image on a loopback-only port, with a health check and named data volume.
- [ ] `DATABASE_URL` is supplied through the environment and no credential is committed.
- [ ] One Prisma Next contract declares UUID-primary-key `spaces` and `cards` tables with JSONB documents, revision metadata, timestamps, and the card-to-space foreign key.
- [ ] Contract artifacts are emitted explicitly and a versioned migration creates the schema.
- [ ] Application code imports database capabilities only through the `@prisma-next/postgres` facade and one adjacent database entry point.
- [ ] A repeatable smoke test proves a migrated Docker PostgreSQL accepts a typed write and read.
- [ ] The normal verification workflow remains runnable when PostgreSQL is not required by a test.

