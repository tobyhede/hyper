# 10 — PostgreSQL integration in CI

**What to build:** Add a dedicated CI gate that provisions PostgreSQL and runs the existing Prisma Next migration and PostgreSQL integration suites on every pull request and push to `main`.

**Blocked by:** 03 — Prisma Next PostgreSQL foundation; 04 — PostgreSQL space repository.

**Status:** resolved

- [x] CI provisions the same pinned PostgreSQL image used by local Compose and waits for its health check before database commands run.
- [x] The database name, user, password, and `DATABASE_URL` are job-scoped CI values; no credential is committed or exposed in logs.
- [x] The PostgreSQL job uses Node 24, the repository's pinned pnpm version, and `pnpm install --frozen-lockfile`.
- [x] The existing offline `pnpm contract:check` gate remains in place; after migrations, the PostgreSQL job runs `prisma-next db verify` against the live database and fails on database drift.
- [x] The job initializes an empty database through the committed migration history and runs `pnpm test:integration:postgres` rather than duplicating its migration or Vitest commands in the workflow.
- [x] The gate runs both the typed Prisma/PostgreSQL smoke tests and the complete `PostgresSpaceRepository` integration suite, including transactional commits, optimistic conflicts, rollback, and insert-only import behavior.
- [x] A PostgreSQL integration failure fails the PostgreSQL job and workflow, while preserving enough test output to diagnose the failing migration or test without printing credentials.
- [x] The existing database-independent `pnpm verify` and Playwright jobs remain unchanged in responsibility and do not require PostgreSQL.

## Answer

CI now has an independent `postgres` job alongside `verify` and `e2e`. It
generates and masks a disposable password and connection URL, then reuses
`compose.yaml` so the local and CI image digest, loopback port and readiness
health check cannot drift. The job installs with the pinned Node and pnpm
toolchain, starts PostgreSQL through `pnpm postgres:up`, runs the existing
`pnpm test:integration:postgres` entry point, and finishes with full
`prisma-next db verify` against the migrated database.

Normal migration and test output remains in the job log. PostgreSQL container
logs are added on failure, with both credential forms masked first, and an
`always()` step stops Compose. The offline contract gate and database-free
browser job remain unchanged and all three peer jobs can run concurrently.

Verification on 2026-07-31:

- `actionlint .github/workflows/ci.yml`: passed.
- `pnpm verify`: 63 files and 517 tests passed with coverage.
- Isolated `pnpm test:integration:postgres`: 3 files and 32 tests passed after
  applying both committed migrations to a fresh PostgreSQL database.
- `prisma-next db verify`: the database marker and live schema matched the
  emitted contract with no warnings or unclaimed objects.
- The isolated PostgreSQL container was stopped after verification.
