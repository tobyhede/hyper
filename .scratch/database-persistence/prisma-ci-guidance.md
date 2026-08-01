# Prisma CI guidance for Issue 10

Research date: 2026-07-31

## Bottom line

Prisma's current first-party CI pattern supports Issue 10's broad shape: keep
database-free tests separate, give database-backed integration tests a fresh
PostgreSQL instance with a readiness check, install from the lockfile with the
package-manager cache enabled, initialize the schema, run the tests on every
pull request, and make the result a required merge check. The current Prisma
ORM 7 testing article demonstrates separate unit, integration, and E2E jobs;
each database-backed job owns a PostgreSQL service container with
`pg_isready`. ([Prisma testing CI article](https://www.prisma.io/blog/testing-series-5-xWogenROXm))

For Hyper, however, the schema initialization command must be the repository's
checked-in **Prisma Next migration history**, not the article's `prisma db push`.
Prisma Next explicitly prescribes an offline `migration check`, a read-only
`migrate --show` preview where useful, and `migrate` to apply reviewed migration
packages. It separately prescribes `db verify` for CI/deployment checks against
the emitted contract. ([applying a Prisma Next migration](https://www.prisma.io/docs/orm/next/migrations/applying-a-migration),
[generating a Prisma Next migration](https://www.prisma.io/docs/orm/next/migrations/generating-a-migration),
[`db verify`](https://www.prisma.io/docs/cli/next/db-verify))

Therefore the earlier Issue 10 recommendation remains sound:

1. retain Hyper's existing offline `contract:check`, which emits and diffs the
   contract artifacts and runs `migration check`;
2. add an independent PostgreSQL job on every pull request and push to `main`;
3. start one clean PostgreSQL instance and wait for its health check;
4. run `pnpm test:integration:postgres`, which emits the contract, applies the
   committed migrations with the pinned `prisma-next migrate`, and runs the
   integration suite; and
5. run full `prisma-next db verify` afterward.

The only material mismatch with Prisma's current GitHub Actions example is
provisioning: Prisma shows a GitHub Actions service container, while Issue 10's
existing recommendation reuses Hyper's Compose file to keep its exact pinned
image digest and health policy in one place. That Compose choice is reasonable
local/CI parity, but it is **Hyper's** design, not a Prisma recommendation.

## What established Prisma ORM recommends

### CI topology and pull-request behavior

Prisma's current testing article runs CI for pull requests to `main`, separates
unit, integration, and E2E concerns into jobs, and provisions PostgreSQL only
for jobs that need it. It says to use branch protection to prevent merging
until those jobs pass. This directly supports keeping Hyper's `verify`, E2E,
and PostgreSQL integration jobs independent peers rather than making the
database a dependency of all verification. ([Prisma testing CI article](https://www.prisma.io/blog/testing-series-5-xWogenROXm))

The same article uses a fresh PostgreSQL service container in each
database-backed job, publishes it on localhost, and supplies a `pg_isready`
health check. It explicitly prefers this over downloading/configuring Compose
inside the example workflow. This is the closest documented Prisma pattern for
Issue 10, although it does not impose a requirement on projects that already
have a pinned Compose definition. ([Prisma testing CI article](https://www.prisma.io/blog/testing-series-5-xWogenROXm))

Prisma also documents a much heavier managed-preview option: create an isolated
Prisma Postgres database for each pull request, seed it, and delete it when the
PR closes, with per-PR concurrency control. That is useful when an application
needs a persistent preview environment; it is unnecessary for Hyper's
short-lived integration job on a disposable hosted runner.
([Prisma Postgres GitHub Actions guide](https://www.prisma.io/docs/guides/integrations/github-actions))

### Migration commands

For established Prisma ORM, the production/testing command is
`prisma migrate deploy`. Prisma recommends running it from automated CI/CD,
with the complete migration directory committed, instead of temporarily using
production credentials from a developer machine. Its GitHub Actions deployment
example runs on pushes to `main` that change `prisma/migrations/**` and takes
`DATABASE_URL` from a repository secret.
([deploying database changes](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate),
[development and production](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production))

That deploy example is deployment guidance, not a reason to path-filter
Hyper's PostgreSQL test job. Issue 10 also tests repository and CLI behavior,
which can regress without a migration-file change, so it should continue to run
on every PR and push covered by the workflow.

`prisma migrate deploy` does **not** detect live schema drift, does not use a
shadow database, does not reset the database, and does not generate artifacts.
Consequently, the classic ORM command is only an analogy for "apply committed
migrations non-interactively"; it cannot replace Prisma Next's explicit
contract/schema verification in Hyper.
([`migrate deploy` reference](https://www.prisma.io/docs/cli/migrate/deploy),
[development and production](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production))

### Test database setup

The current ORM testing article uses `prisma db push` against a fresh disposable
database before integration tests. That is suitable for the article's goal of
creating the current schema quickly, but it does not exercise a committed
migration history. Hyper's Issue 10 explicitly requires the latter, so
`test:integration:postgres` correctly uses `prisma-next migrate` instead.
([Prisma testing CI article](https://www.prisma.io/blog/testing-series-5-xWogenROXm),
[Prisma Next migration model](https://www.prisma.io/docs/orm/next/migrations/how-migrations-work))

## What Prisma Next recommends

Prisma Next is Early Access, and Prisma says Prisma 7 remains its recommended
production version. Recommendations below are therefore narrower and more
version-sensitive than established Prisma ORM guidance.
([Prisma Next CLI reference](https://www.prisma.io/docs/cli/next),
[official Prisma Next repository](https://github.com/prisma/prisma-next))

### Offline migration and contract checks

`prisma-next migration check` is explicitly designed for CI. It validates
on-disk migration-package completeness, hashes, and graph integrity, and exits
nonzero for resolution or integrity failures. Prisma says to commit the authored
`migration.ts` and emitted `ops.json` together; `migration check` catches a stale
recompile or direct `ops.json` edit. This directly validates Hyper's existing
offline `contract:check` gate.
([generating a migration](https://www.prisma.io/docs/orm/next/migrations/generating-a-migration),
[editing a migration](https://www.prisma.io/docs/orm/next/migrations/editing-a-migration))

Prisma Next's contract artifacts are deterministic and intended to be diffed
in review. They contain no rows, credentials, or connection details, so
committing the source and emitted artifacts is expected. Hyper's emit-then-
`git diff --exit-code` check is a repository implementation of that documented
property, rather than a named Prisma command.
([Prisma Next data contract](https://www.prisma.io/docs/orm/next/contract-authoring/the-data-contract),
[`contract emit`](https://www.prisma.io/docs/cli/next/contract-emit))

### Applying checked-in migrations

For CI and production, Prisma Next says migrations should arrive already
planned, reviewed, and committed. Its documented flow is:

```text
prisma-next migration check
prisma-next migrate --show --db "$DATABASE_URL"
prisma-next migrate --db "$DATABASE_URL"
```

`--show` is read-only and useful for logging what would run; it is not a schema
rehearsal. Prisma Next currently has no shadow-database rehearsal and suggests a
staging database when execution rehearsal is needed. Applying the complete
history to Hyper's fresh CI PostgreSQL database is therefore the meaningful
migration rehearsal, not merely a CLI preview.
([applying a migration](https://www.prisma.io/docs/orm/next/migrations/applying-a-migration))

On PostgreSQL, Prisma Next documents that a migration run is transactional and
guarded by an advisory lock. Every operation has prechecks and postchecks, and
the runner first rejects a database marker that is not a state in the migration
graph. These safeguards support applying the history in CI, but do not remove
the value of the final schema/contract verification.
([applying a migration](https://www.prisma.io/docs/orm/next/migrations/applying-a-migration),
[how migrations work](https://www.prisma.io/docs/orm/next/migrations/how-migrations-work))

One documentation inconsistency matters for a pinned preview: the high-level
CLI page still shows `migration apply`, whereas the current migration guide says
the applying command is `prisma-next migrate`, not `migration apply`. Hyper's
installed 0.16.0 CLI exposes `migrate`, and its existing `db:migrate` script is
therefore the version-authoritative choice.
([CLI common workflow](https://www.prisma.io/docs/cli/next),
[how migrations work](https://www.prisma.io/docs/orm/next/migrations/how-migrations-work),
[`package.json`](../../package.json))

### Drift verification

`prisma-next db verify` is explicitly intended for CI and deployment checks.
The full command verifies the database marker and whether the live schema
satisfies the emitted contract. `--marker-only` and `--schema-only` narrow the
check; neither is preferable for Issue 10 because the acceptance criterion asks
for live database drift detection after applying migrations.
([`db verify`](https://www.prisma.io/docs/cli/next/db-verify))

`--strict` additionally rejects schema elements not represented by the
contract. The docs present it as an option, not a universal CI default. Issue 10
should use the full non-strict command unless Hyper explicitly decides that
unclaimed objects are forbidden; choosing strict mode is project policy, not a
Prisma-required best practice. Prisma recommends `--json` for automation, but
ordinary exit status is sufficient for a GitHub Actions gate unless Hyper wants
to parse or annotate the structured result.
([`db verify`](https://www.prisma.io/docs/cli/next/db-verify),
[Prisma Next CLI reference](https://www.prisma.io/docs/cli/next))

## Provisioning, credentials, and caching

The official ORM test workflow puts literal placeholder credentials in the
workflow only because its PostgreSQL instance is disposable; it warns never to
put real credentials there and directs sensitive values to GitHub Actions
secrets. The production migration example likewise uses a secret
`DATABASE_URL`. Hyper's proposed random, masked, job-scoped password is
compatible with this guidance and avoids requiring repository secrets for fork
PRs, but random generation is a Hyper/GitHub hardening choice rather than a
Prisma-prescribed step.
([Prisma testing CI article](https://www.prisma.io/blog/testing-series-5-xWogenROXm),
[deploying database changes](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate))

Prisma's current pnpm example enables `actions/setup-node`'s `cache: pnpm`, then
installs dependencies and regenerates Prisma Client. It does not cache the
database. Prisma Next emits deterministic TypeScript/JSON contract artifacts
rather than Prisma ORM's generated client and recommends an offline emit; there
is no documented Prisma Next-specific CI cache that Hyper needs beyond its
existing pnpm dependency cache. A fresh database for each job is the documented
test pattern and is important for proving the migration history from empty.
([Prisma testing CI article](https://www.prisma.io/blog/testing-series-5-xWogenROXm),
[Prisma Next data contract](https://www.prisma.io/docs/orm/next/contract-authoring/the-data-contract))

## Directly applicable versus analogy

| Prisma guidance | Applicability to Hyper Issue 10 |
| --- | --- |
| Separate DB-free and DB-backed CI jobs | Directly applicable; add PostgreSQL as a peer gate. |
| Run integration checks for every PR and require them before merge | Directly applicable. |
| Fresh PostgreSQL plus readiness health check | Directly applicable. |
| GitHub Actions PostgreSQL service container | Closest official example, but Hyper may deliberately reuse Compose to preserve its pinned image/health source of truth. |
| ORM test setup with `prisma db push` | Not applicable; it bypasses the migration history Issue 10 must test. |
| ORM production `prisma migrate deploy` | Analogy only; Hyper uses pinned Prisma Next `migrate`. |
| Prisma Next offline `migration check` | Directly applicable and already present in `contract:check`. |
| Prisma Next `migrate --show` | Optional diagnostic preview; not required when the existing integration script should remain the single entry point. |
| Prisma Next `migrate` on a clean database | Directly applicable through `test:integration:postgres`. |
| Full `prisma-next db verify` after migration | Directly applicable and recommended. |
| `db verify --strict` | Optional project policy, not Prisma's default recommendation. |
| Managed database per PR with cleanup | Valid alternative for persistent previews, out of scope for this local-container test job. |
| pnpm dependency cache | Directly applicable and already matches the workflow pattern. |
| Database/Compose-volume caching | Not recommended; start clean to exercise the full history. |

## Recommendation change from the earlier research

No command or gate needs to change. The earlier note should only sharpen its
wording around provisioning: **Prisma's published GitHub Actions test pattern
uses service containers, not Compose.** Reusing Hyper's existing Compose file
is still defensible because Issue 10 requires the exact locally pinned image and
health configuration, but the rationale belongs to this repository rather than
to Prisma's docs.
