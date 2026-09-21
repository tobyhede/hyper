# 26 — One database target composition

**What to build:** Each SQL database declares one target — how it opens from the environment, builds its `SqlStore` and closes — and one HTTP runtime, one CLI entry and one Vite host configuration take a target. `SQLITE_PATH` is resolved and validated in one place.

**Blocked by:** 25 — Repository behaviour lives in the contract. Both change the SQLite restart proof: 25 shares its fixture and cleanup, and this ticket moves its `SQLITE_PATH` handling into the target, so this one follows.

**Status:** resolved

**Tags:** release/v1

**Audited:** 2026-09-20 against `b1ac983d`. Both runtime compositions and the path-policy disagreement remain in the code. Ticket 25 is still open. This ticket is required before `v1-release/07`; the statements below are code inspection, not a new launch or database test result.

**Why:** The two HTTP runtimes differ by the line that builds the repository, and the `SQLITE_PATH` rules are spread over six places that disagree: `src/sqlite/db.ts` requires a writable parent, `sqlite-http-runtime.ts` refuses a relative path, `sqlite-entry.ts` checks the file exists but accepts a relative path, `dev:sqlite` has its own shell check, `prisma-next.config.sqlite.ts` reads the variable raw, and the SQLite restart proof re-requires it. So `pnpm hyper:sqlite` accepts a relative path the host refuses. And they resolve different files: `dev:sqlite` exports its default before anything loads `.env`, and `dotenv` never overrides a set variable, so a `SQLITE_PATH` set only in `.env` (which `.env.example` lists) reaches `pnpm hyper:sqlite` but not the migration or the host. A third database would touch about 30 files.

- [x] One target per database. PostgreSQL's opens its client when composed rather than when `src/prisma/db.ts` is imported.
- [x] The absolute-path, required and writable-parent rules for `SQLITE_PATH` live in the SQLite target, and the host, CLI, migration config and restart proof all use it; `pnpm hyper:sqlite` refuses a relative path as the host does. Preserve each caller's file-lifecycle needs: migration can create the file, while the CLI still requires an existing migrated file. Offline migration planning without a database path must continue to work.
- [x] The SQLite target resolves `SQLITE_PATH` once: the repository root's `.env` first, then `dev:sqlite`'s default, and the shell stops choosing it. Today, with `SQLITE_PATH=/abs/other.db` only in `.env`, `pnpm dev:sqlite` migrates and serves `.scratch/sqlite/hyper.db` while `pnpm hyper:sqlite` imports into or exports from `/abs/other.db`, and nothing reports it. The root `.env` is named rather than found: the host runs from `packages/app`, where `dotenv/config` reads `packages/app/.env`. A test runs the three entry points with `SQLITE_PATH` set only in a `.env` and asserts they name one file.
- [x] One HTTP runtime composition with the establish → retry → give-up behaviour, tested for both targets. SQLite already tests give-up for a non-JSON stored Meta document in `test/integration/sqlite-http-runtime.test.ts`; retain that proof and cover recovery after a transient startup failure through the composed runtime. Ticket 31 owns changes to failure classification and retry policy; this ticket consolidates their composition, whichever lands first.
- [x] One CLI entry and one Vite host configuration take a target; `vite.config.ts` stops exporting `resolveAliases` only for the SQLite configuration.
- [x] The per-database CLI and HTTP-runtime integration suites become one suite each, parameterised by target, so the one entry and the one runtime are tested once per database rather than written twice. (Architecture review, 2026-09-18.)
- [x] The database is still chosen by which script runs, not by a request or an environment selector.
- [x] The alias lists and what `AGENTS.md` says about them agree. `AGENTS.md` says Vite "needs no alias at all" and that the copy in `packages/app/vite.config.ts` is gone, but `vite.config.ts` defines `resolveAliases` from `workspaceAliases()` and uses it itself (`resolve: resolveAliases`), and `vitest.sqlite.config.ts` carries a further copy. Either remove the Vite alias, proving the bundle builds identically as that sentence claims was once done, or correct the sentence; and remove or derive the Vitest SQLite copy.

Out of scope: moving to Prisma ORM v8.

## Answer

Resolved by the database targets in `src/prisma/target.ts` and `src/sqlite/target.ts`. Each opens one client, builds the shared SQL repository and owns close. The HTTP establishment loop and CLI lifecycle now each have one target-parameterised composition, while the script-specific wrappers continue to choose PostgreSQL or SQLite explicitly.

SQLite configuration now reads the repository-root `.env`, applies one absolute-path and writable-parent policy, and lets each caller state its file lifecycle: migration may omit or create the file, the host requires a path, and the CLI requires an existing migrated file. `dev:sqlite` resolves that path once and passes it to migration and Vite.

The two application Vite entries use one target-parameterised config and one
workspace-alias map; `AGENTS.md` now describes that composition accurately. The
SQLite Vitest config derives the root config instead of copying its aliases.
