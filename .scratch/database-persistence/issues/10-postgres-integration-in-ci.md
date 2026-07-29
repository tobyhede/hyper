# 10 — PostgreSQL integration in CI

**What to build:** Add a dedicated CI gate that provisions PostgreSQL and runs the existing Prisma Next migration and PostgreSQL integration suites on every pull request and push to `main`.

**Blocked by:** 03 — Prisma Next PostgreSQL foundation; 04 — PostgreSQL space repository.

**Status:** ready-for-agent

- [ ] CI provisions the same pinned PostgreSQL image used by local Compose and waits for its health check before database commands run.
- [ ] The database name, user, password, and `DATABASE_URL` are job-scoped CI values; no credential is committed or exposed in logs.
- [ ] The PostgreSQL job uses Node 24, the repository's pinned pnpm version, and `pnpm install --frozen-lockfile`.
- [ ] The existing offline `pnpm contract:check` gate remains in place; after migrations, the PostgreSQL job runs `prisma-next db verify` against the live database and fails on database drift.
- [ ] The job initializes an empty database through the committed migration history and runs `pnpm test:integration:postgres` rather than duplicating its migration or Vitest commands in the workflow.
- [ ] The gate runs both the typed Prisma/PostgreSQL smoke tests and the complete `PostgresSpaceRepository` integration suite, including transactional commits, optimistic conflicts, rollback, and additive import behavior.
- [ ] A PostgreSQL integration failure fails the PostgreSQL job and workflow, while preserving enough test output to diagnose the failing migration or test without printing credentials.
- [ ] The existing database-independent `pnpm verify` and Playwright jobs remain unchanged in responsibility and do not require PostgreSQL.
