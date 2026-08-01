# PostgreSQL integration in CI — Issue 10 research

Research date: 2026-07-31

## Conclusion

Issue 10 should add one independent `postgres` job to
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). The job should use
the same checkout, pnpm, Node, cache, and frozen-install setup as the existing
jobs; generate and mask a disposable PostgreSQL password; export all connection
settings through `GITHUB_ENV`; start the repository's existing Compose service;
run the existing PostgreSQL integration script; run a full Prisma Next database
verification; print Compose logs only on failure; and always stop Compose.

The job should **reuse** [`compose.yaml`](../../compose.yaml) rather than copy its
image and health configuration into a GitHub Actions service block. This keeps
the PostgreSQL 17.5 Bookworm digest and `pg_isready` policy in one place, while
`pnpm postgres:up` already expands to `docker compose up -d --wait`. Docker
documents that `--wait` waits for services to become running or healthy.
([Docker Compose `up`](https://docs.docker.com/reference/cli/docker/compose/up/))

Likewise, the workflow should invoke `pnpm test:integration:postgres`, not spell
out contract emission, migration, or Vitest itself. The package script is the
single local/CI entry point for those operations. A separate
`pnpm exec prisma-next db verify` immediately afterward supplies the live drift
gate required by the issue.

## Intended outcome

The issue statement requires a PostgreSQL-backed gate on every pull request and
push to `main`, without changing the responsibilities of the offline `verify`
or database-free Playwright jobs.
([Issue 10](issues/10-postgres-integration-in-ci.md))

The acceptance criteria reduce to four boundaries:

1. **Infrastructure:** one fresh PostgreSQL database from the exact pinned local
   image, ready only after the existing health check passes.
2. **Toolchain:** Node from `.node-version`, pnpm from `packageManager`, and a
   frozen lockfile install.
3. **Schema:** committed contract artifacts and migration history remain checked
   offline, then the migrated live database is verified against the emitted
   contract.
4. **Behavior:** the complete existing typed smoke, repository, and CLI
   integration suites run and can fail the workflow.

Issue 12, which blocked this work, is resolved: the integration Vitest config
now has `fileParallelism: false` because destructive truncation is global to the
one database. The gate can safely invoke that corrected configuration without
additional worker or database partitioning.
([Issue 12](issues/12-integration-suite-shares-one-database.md),
[`vitest.integration.config.ts`](../../vitest.integration.config.ts))

## Current state and exact gap

The workflow already triggers on pull requests and pushes to `main`, grants only
`contents: read`, and has independent `verify` and `e2e` jobs. The `verify` job
already runs `pnpm contract:check` before `pnpm verify`; that offline gate emits
the contract, checks that both generated artifacts are unchanged, and checks
the on-disk migration history. It should remain where it is and need not be
duplicated in the PostgreSQL job.
([workflow](../../.github/workflows/ci.yml),
[`package.json`](../../package.json))

What is missing is only the live-database job. The repository already supplies
all lower-level pieces:

- [`compose.yaml`](../../compose.yaml) pins
  `postgres:17.5-bookworm` by digest, creates the configured user/database, binds
  only loopback port `55432` by default, and checks readiness with
  `pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"`.
- `pnpm postgres:up` uses `docker compose up -d --wait`, and
  `pnpm postgres:down` uses `docker compose down`.
- `pnpm test:integration:postgres` emits the contract, applies the committed
  migrations, then runs all files selected by
  [`vitest.integration.config.ts`](../../vitest.integration.config.ts).
- Those files are the typed Prisma/PostgreSQL smoke suite, the complete
  `PostgresSpaceRepository` suite, and real CLI import/startup coverage.
  ([integration tests](../../test/integration))

The official PostgreSQL image requires a non-empty `POSTGRES_PASSWORD`; its
`POSTGRES_USER` and `POSTGRES_DB` inputs create the selected superuser and
database during initialization.
([PostgreSQL Official Image](https://hub.docker.com/_/postgres))

## Recommended job shape

This is a design sketch, not an implementation patch:

```yaml
postgres:
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      with: { persist-credentials: false }
    - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0
    - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
      with:
        node-version-file: .node-version
        cache: pnpm
    - run: pnpm install --frozen-lockfile

    - name: Configure ephemeral PostgreSQL
      id: postgres-env
      run: |
        password="$(openssl rand -hex 32)"
        database_url="postgresql://hyper_ci:${password}@127.0.0.1:55432/hyper_ci"
        echo "::add-mask::$password"
        echo "::add-mask::$database_url"
        {
          echo "POSTGRES_DB=hyper_ci"
          echo "POSTGRES_USER=hyper_ci"
          echo "POSTGRES_PASSWORD=$password"
          echo "POSTGRES_PORT=55432"
          echo "DATABASE_URL=$database_url"
        } >> "$GITHUB_ENV"

    - name: Start PostgreSQL
      run: pnpm postgres:up

    - name: Run PostgreSQL integration suite
      run: pnpm test:integration:postgres

    - name: Verify live database contract
      run: pnpm exec prisma-next db verify

    - name: Show PostgreSQL logs
      if: failure() && steps.postgres-env.outcome == 'success'
      run: docker compose logs --no-color postgres

    - name: Stop PostgreSQL
      if: always() && steps.postgres-env.outcome == 'success'
      run: pnpm postgres:down
```

The sketch matches the shipped job, which remains the authority. Each action is
pinned to the commit its `v4` tag named rather than the tag itself: this job
holds a generated database password while it installs dependencies, so a
repointed tag would be a credential exposure and not an abstract supply-chain
concern.

The generated hex password is URL-safe, never committed, and never passed as a
command-line argument. GitHub documents that `add-mask` redacts a registered
value from job logs and that values written to `GITHUB_ENV` are available to
subsequent steps in the same job. Mask both the password and complete URL before
writing either one.
([GitHub workflow commands](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands))

`pnpm/action-setup` reads the pnpm version from `package.json` when its `version`
input is omitted, and `actions/setup-node` supports `.node-version` plus pnpm
dependency caching. This exactly matches the existing jobs and Issue 10's
pinned-toolchain requirement.
([pnpm/action-setup v4](https://github.com/pnpm/action-setup/tree/v4),
[actions/setup-node v4](https://github.com/actions/setup-node/tree/v4))

`ubuntu-latest` is appropriate for this design. GitHub provisions a new VM for
each hosted job, and its Ubuntu image includes Docker Engine, Docker Compose v2,
and OpenSSL. Therefore the named Compose volume begins empty for each job and
the password can be generated without installing extra tools.
([GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[Ubuntu runner software](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md))

## Prisma verification detail

The live verification must be the full `db verify`, not `--marker-only` or
`--schema-only`. Prisma documents that the full command checks both the database
marker and live schema against the emitted contract and is intended for CI and
deployment checks. A non-match exits unsuccessfully, so the ordinary Actions
step fails the job without special shell handling.
([Prisma Next `db verify`](https://www.prisma.io/docs/cli/next/db-verify))

The bare command is the acceptance criterion's least-surprising policy. Prisma
also offers `--strict`, which additionally rejects database elements not
claimed by the contract. That is a broader policy choice than merely proving
the migrated database satisfies Hyper's contract; add it only if Issue 10 is
clarified to treat extra elements as failure-worthy drift.

The command should read `DATABASE_URL` through the existing
[`prisma-next.config.ts`](../../prisma-next.config.ts), not interpolate the URL
onto the command line. This avoids displaying the credential in the Actions
step text and exercises the same configuration seam as local migration and
runtime use.

## Acceptance-criterion check

| Criterion | Evidence or recommended mechanism |
| --- | --- |
| Same pinned image and health wait | Reuse `compose.yaml`; `pnpm postgres:up` delegates to Compose `--wait`. |
| Job-scoped connection values; no leaked credential | Generate a disposable password, mask password and URL, append them with DB/user/port to `GITHUB_ENV`. |
| Node 24, pinned pnpm, frozen install | Copy the existing setup steps; `.node-version` is `24.18.1`, while `packageManager` is `pnpm@9.15.0`. |
| Offline contract gate retained | Leave the existing `verify` job and `pnpm contract:check` unchanged. |
| Empty DB initialized by committed migrations | A fresh hosted VM has no prior named volume; invoke `pnpm test:integration:postgres`, whose script runs `pnpm db:migrate`. |
| Live drift check | Run full `pnpm exec prisma-next db verify` after the integration command has migrated the database. |
| Complete integration coverage | Invoke the existing script and corrected serial Vitest config; do not select individual files in YAML. |
| Useful failure output without credentials | Preserve normal migration/Vitest output, show `docker compose logs postgres` on failure, and mask both secret forms. |
| Offline verify and Playwright stay DB-free | Add a peer job; do not add `needs`, PostgreSQL setup, or PostgreSQL environment to either existing job. |

## Scope cautions

- Do not add `pnpm e2e:postgres` to this issue. It is a separate opt-in browser
  durability test; Issue 10 names the Prisma and repository integration suites.
- Do not duplicate the PostgreSQL image digest or health options in CI. That
  creates a second configuration source that can drift from local Compose.
- Do not use a repository secret for this disposable database. A generated
  per-job value works on forked pull requests as well as trusted branches and
  is not a durable credential.
- Do not use `docker compose down --volumes`. The hosted VM is discarded after
  the job, while ordinary `postgres:down` matches the repository's documented
  non-destructive lifecycle.
- Keep the PostgreSQL job independent rather than `needs: verify`; all three
  gates can run concurrently and the workflow fails if any peer job fails.
