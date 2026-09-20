# 03 — Rename the Thing model to Resource, in both databases

**Status:** ready-for-agent
**Blocked by:** 02 — A Diagram is a Map and a Thing is a Resource.

**What to build:** `model Thing` becomes `model Resource` and `@@map("things")` becomes `@@map("resources")` in both database contracts, with one forward migration each, and the runtime SQL identifier literals move with them.

**Why:** ADR 0101. The model is the last place the retired noun is written, and it is written in a tree the sweep does not open.

**Both migration trees are excluded from the sweep on purpose** (`migrations/`, `migrations-sqlite/`). ADR 0056 makes migration snapshots history. A swept snapshot passes against an already-migrated local database and fails against a fresh one, and **nothing in `verify`, `e2e` or `e2e:ladle` can observe that** — only CI's `postgres` and `sqlite` jobs can. The Card rename learned this once; do not relearn it.

## Two things the previous cycle got wrong, written down so this one does not

**Generating a migration does not need a live database.** The Card ticket assumed it did, wrote that assumption into its own Hazards section and into a PR description, and both had to be corrected afterwards. `prisma-next migrate` refuses without a connection because it *applies*; `prisma-next migration plan` generates one fully offline.

**Pass `--from <head-hash>` explicitly.** `migration plan` with no `--from` plans from `<empty>` — 8 operations including a `CREATE SCHEMA` rather than the 4 this needs — and silently adds a second root to the migration graph. It was caught last time only by reading the operation count and the `from`/`to` hashes the plan prints.

## The rename is destructive, and that is accepted

`prisma-next` has **no table-rename operation** — `renameRlsPolicy` is the only rename on its surface — so the emitted plan for a renamed model is `dropTable` plus `createTable`. **Every row in `things` is destroyed** on both databases. ADR 0056 makes every database here derived, with no production environment and no byte that outlives a reset, which is the only reason this is affordable. A developer with local content exports first (`pnpm hyper export <dir>`) and imports after. Say so in the migration's own doc comment, as `20260910T1429_rename_card_to_thing` does.

**This is two migrations, not one.** SQLite arrived after the Card rename, so `src/prisma/contract.prisma` and `src/sqlite/contract.prisma` each need their own, generated against their own head.

- [ ] Both contracts declare `model Resource` mapped to `resources`.
- [ ] One forward migration per database, generated offline with an explicit `--from`, each with four operations and no `CREATE SCHEMA`.
- [ ] Each migration's doc comment states that it destroys stored rows and names the export/import recovery.
- [ ] The pre-existing migration files in both trees are byte-identical afterwards.
- [ ] Runtime SQL identifier literals (`things`, `things_pkey`, `things_space_id_idx`, `things_space_id_fkey`) moved wherever they are written as strings rather than generated.
- [ ] `pnpm verify` passes. `pnpm test:integration:postgres` and `pnpm test:integration:sqlite` pass, or are explicitly deferred to CI in the `## Answer` — a fresh database is the stronger test and is exactly what a local already-migrated one cannot give.

## Answer

<!-- Filled in as the work lands. -->
