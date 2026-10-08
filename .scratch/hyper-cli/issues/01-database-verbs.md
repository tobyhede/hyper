# 01: The database verbs

**What to build:** One `pnpm hyper` entry point whose database commands are named verbs (see `../spec.md` and ADR 0124). `import <dir>` establishes the aggregate of an empty store and refuses an initialized one; `import <dir> --dangerous-replace` replaces it; `export <dir>` exports it. Both take `--store postgres|sqlite`, defaulting to `postgres`. Bare `hyper` prints usage and exits 2, and `help` / `--help` list every verb, author verbs first. `pnpm hyper:sqlite`, `src/cli/sqlite-entry.ts` and `--dangerous-truncate` are removed.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] `import` and `export` are verbs; a path with no verb is a usage error
- [x] `--store postgres|sqlite` chooses the database, default `postgres`; `DATABASE_URL` and `SQLITE_PATH` still carry connection details
- [x] `--dangerous-replace` replaces the stored aggregate; without it an initialized store is refused with a message naming the flag
- [x] Bare `hyper` and any usage error print the usage line and exit 2; `help` and `--help` print every verb with one line each, `init` and `run` first
- [x] `pnpm hyper:sqlite`, `sqlite-entry.ts` and `--dangerous-truncate` are gone, with no alias
- [x] The CLI unit tests and both CLI integration suites (PostgreSQL and SQLite) are moved to the verbs
- [ ] Targeted local checks pass; the draft PR's `CI passed` is green (including the `postgres` and `sqlite` jobs)
