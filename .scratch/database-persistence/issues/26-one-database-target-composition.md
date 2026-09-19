# 26 — One database target composition

**What to build:** Each SQL database declares one target — how it opens from the environment, builds its `SqlStore` and closes — and one HTTP runtime, one CLI entry and one Vite host configuration take a target. `SQLITE_PATH` is resolved and validated in one place.

**Blocked by:** 25 — Repository behaviour lives in the contract. Both change the SQLite restart proof: 25 shares its fixture and cleanup, and this ticket moves its `SQLITE_PATH` handling into the target, so this one follows.

**Status:** ready-for-agent

**Why:** The two HTTP runtimes differ by the line that builds the repository, and the `SQLITE_PATH` rules are spread over six places that disagree: `src/sqlite/db.ts` requires a writable parent, `sqlite-http-runtime.ts` refuses a relative path, `sqlite-entry.ts` checks the file exists but accepts a relative path, `dev:sqlite` has its own shell check, `prisma-next.config.sqlite.ts` reads the variable raw, and the SQLite restart proof re-requires it. So `pnpm hyper:sqlite` accepts a relative path the host refuses. And they resolve different files: `dev:sqlite` exports its default before anything loads `.env`, and `dotenv` never overrides a set variable, so a `SQLITE_PATH` set only in `.env` (which `.env.example` lists) reaches `pnpm hyper:sqlite` but not the migration or the host. A third database would touch about 30 files.

- [ ] One target per database. PostgreSQL's opens its client when composed rather than when `src/prisma/db.ts` is imported.
- [ ] The absolute-path, required and writable-parent rules for `SQLITE_PATH` live in the SQLite target, and the host, CLI, migration config and restart proof all use it; `pnpm hyper:sqlite` refuses a relative path as the host does.
- [ ] The SQLite target resolves `SQLITE_PATH` once: the repository root's `.env` first, then `dev:sqlite`'s default, and the shell stops choosing it. Today, with `SQLITE_PATH=/abs/other.db` only in `.env`, `pnpm dev:sqlite` migrates and serves `.scratch/sqlite/hyper.db` while `pnpm hyper:sqlite` imports into or exports from `/abs/other.db`, and nothing reports it. The root `.env` is named rather than found: the host runs from `packages/app`, where `dotenv/config` reads `packages/app/.env`. A test runs the three entry points with `SQLITE_PATH` set only in a `.env` and asserts they name one file.
- [ ] One HTTP runtime composition with the establish → retry → give-up behaviour, tested for both targets; SQLite's start-up retry gains the test it lacks.
- [ ] One CLI entry and one Vite host configuration take a target; `vite.config.ts` stops exporting `resolveAliases` only for the SQLite configuration.
- [ ] The per-database CLI and HTTP-runtime integration suites become one suite each, parameterised by target, so the one entry and the one runtime are tested once per database rather than written twice. (Architecture review, 2026-09-18.)
- [ ] The database is still chosen by which script runs, not by a request or an environment selector.
- [ ] The alias lists and what `AGENTS.md` says about them agree. `AGENTS.md` says Vite "needs no alias at all" and that the copy in `packages/app/vite.config.ts` is gone, but `vite.config.ts` defines `resolveAliases` from `workspaceAliases()` and uses it itself (`resolve: resolveAliases`), and `vitest.sqlite.config.ts` carries a further copy. Either remove the Vite alias, proving the bundle builds identically as that sentence claims was once done, or correct the sentence; and remove or derive the Vitest SQLite copy.

Out of scope: moving to Prisma ORM v8.
