# 03 — Rename the Thing model to Resource, in both databases

**Status:** resolved
**Blocked by:** 02 — A Diagram is a Map and a Thing is a Resource.

**What to build:** `model Thing` becomes `model Resource` and `@@map("things")` becomes `@@map("resources")` in both database contracts, with one forward migration each, and the runtime SQL identifier literals move with them.

**Why:** ADR 0101. The model is the last place the retired noun is written, and it is written in a tree the sweep does not open.

**Both migration trees are excluded from the sweep on purpose** (`migrations/`, `migrations-sqlite/`). ADR 0056 makes migration snapshots history. A swept snapshot passes against an already-migrated local database and fails against a fresh one, and **nothing in `verify`, `e2e` or `e2e:ladle` can observe that** — only CI's `postgres` and `sqlite` jobs can. The Card rename learned this once; do not relearn it.

## Two things the previous cycle got wrong, written down so this one does not

**Generating a migration does not need a live database.** The Card ticket assumed it did, wrote that assumption into its own Hazards section and into a PR description, and both had to be corrected afterwards. `prisma-next migrate` refuses without a connection because it *applies*; `prisma-next migration plan` generates one fully offline.

**Pass `--from <head-hash>` explicitly.** `migration plan` with no `--from` plans from `<empty>` — on PostgreSQL, 8 operations including a `CREATE SCHEMA` rather than the 4 this needs — and silently adds a second root to the migration graph. It was caught last time only by reading the operation count and the `from`/`to` hashes the plan prints.

## The rename is destructive, and that is accepted

`prisma-next` has **no table-rename operation** — `renameRlsPolicy` is the only rename on its surface — so the emitted plan for a renamed model is `dropTable` plus `createTable`. **Every row in `things` is destroyed** on both databases. ADR 0056 makes every database here derived, with no production environment and no byte that outlives a reset, which is the only reason this is affordable. A developer with local content exports first (`pnpm hyper export <dir>`) and imports after. Say so in the migration's own doc comment, as `20260910T1429_rename_card_to_thing` does.

**This is two migrations, not one.** SQLite arrived after the Card rename, so `src/prisma/contract.prisma` and `src/sqlite/contract.prisma` each need their own, generated against their own head.

- [ ] Both contracts declare `model Resource` mapped to `resources`.
- [ ] One forward migration per database, generated offline with an explicit `--from`, and no `CREATE SCHEMA`. **The two operation counts differ.** PostgreSQL plans four — `dropTable`, `createTable`, `createIndex`, `addForeignKey` — exactly as `20260910T1429_rename_card_to_thing` does. SQLite plans three — `dropTable`, `createTable`, `createIndex` — because `@prisma-next/sqlite/migration` has no `addForeignKey`: the foreign key is a `foreignKey(...)` table constraint inside `createTable`, which is how `20260916T1302_initial` writes the one on `things`.
- [ ] Each migration's doc comment states that it destroys stored rows and names the export/import recovery.
- [ ] The pre-existing migration files in both trees are byte-identical afterwards.
- [ ] Runtime SQL identifier literals (`things`, `things_pkey`, `things_space_id_idx`, `things_space_id_fkey`) moved wherever they are written as strings rather than generated.
- [ ] `pnpm verify` passes. `pnpm test:integration:postgres` and `pnpm test:integration:sqlite` pass, or are explicitly deferred to CI in the `## Answer` — a fresh database is the stronger test and is exactly what a local already-migrated one cannot give.

## Answer

Resolved with one generated forward migration for each database. Ticket 02's
atomic vocabulary sweep had already changed the live PostgreSQL and SQLite
contracts and their runtime SQL identifiers to `Resource`/`resources`; this
ticket regenerated both emitted contracts from those sources and connected
them to the previously unchanged migration histories.

Both plans were generated offline with their explicit head storage hashes:

- PostgreSQL starts at
  `sha256:1f367854ac0c2c316a2d9cfdbb704f5531beb59c0d04722e62220c5aaf9aad35`
  and contains exactly four operations: drop `things`, create `resources`,
  create `resources_space_id_idx`, and add `resources_space_id_fkey`.
- SQLite starts at
  `sha256:500b8c46f9e1b6fc97b6575af513184ac010b76b622c3bcbebf6065b151b26a1`
  and contains exactly three operations: create `resources` with its inline
  foreign key, create `resources_space_id_idx`, and drop `things`.

Neither plan creates a schema, and no pre-existing migration file changed. Each
generated migration documents that the drop-and-create destroys stored Resource
rows and tells a developer to export before migrating and import afterwards.

Verification:

- `pnpm verify` — passed: 229 files, 2,880 tests passed and 5 skipped.
- `SQLITE_PATH=<temporary-file> pnpm test:integration:sqlite` — passed on a
  fresh database: both migrations applied, 5 files and 99 tests passed.
- PostgreSQL integration is deferred to CI because no disposable PostgreSQL
  database was started for this ticket.

## Correction — `verify` does observe this, and two defects were hiding each other

The premise above — that a contract diverging from its migrations is visible
only to CI's `postgres` and `sqlite` jobs — is wrong, and reviewing 02 is what
showed it. `test/unit/prisma-foundation.test.ts` runs
`prisma-next migrate --show --from 20260728T1242_initial --to @contract` and
asserts `ok: true`. That is exactly this divergence, and it runs in `verify`.

It did not fire on 02 because the *other* half of the same defect silenced it.
`@contract` resolves through the emitted `src/prisma/contract.json`, and the
sweep rewrote that **generated** file as text: it changed `things` to
`resources` in the body but could not touch `storageHash`, which is a hex
literal with nothing to match. So the committed artifact kept advertising
`sha256:1f367854…`, the pre-rename contract — the very hash this ticket's
PostgreSQL plan starts from — and the migration graph found a path to it. The
honest emit hashes to `sha256:0a1d0e87…`, which nothing reached. Regenerating
the four artifacts is what made the test fail, and these two migrations are
what make it pass again.

The general rule, which outlives this rename: **a sweep that edits a generated
artifact as text can disarm the test that guards it**, because the artifact's
own hash is the thing the test trusts and the thing the substitution cannot
reach. `EXCLUDED_PATHS` protects the migration trees; it did not protect the
emitted contracts, and those are equally derived. Regenerate, never substitute.

This ticket's work landed on `map-resource-02` rather than its own branch: 02
renamed the contracts as an unavoidable consequence of sweeping `.prisma`, so
there is no state of 02 alone that passes its own bar — corrupt artifacts fail
`contract:check`, honest ones fail `verify`, and both fail `db:migrate`. The
two changes are atomic and are now one PR.
