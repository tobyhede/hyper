# 15 — SQLite host opens the Meta Space

**What to build:** A file-backed SQLite database that a Hyper host can start against: migrated, Meta established from Default Content, collection and Meta Space readable over the existing `/api/spaces` resources, and still there after close and reopen. PostgreSQL remains the default. The browser does not change and never names a database path. Authored writes may still fail.

**Blocked by:** 14 — Spike SQLite driver and revision storage (resolved; GO on TEXT revisions, Prisma Next 0.16.0).

**Status:** resolved

Ticket 14's composition constraint is in force from this ticket, not deferred to 18: **one SQLite runtime per process**, constructed once at composition the way PostgreSQL already is. Do not open a second independent client against the same live file from inside the host (tests, CLI helpers, or a second `sqlite()` call). Overlapping writers and two-process contention are 16 and 18.

**Correction (review of 14, 2026-09-16):** one runtime is necessary but not sufficient. The pinned driver opens a new `DatabaseSync` handle for every `transaction()`, so two overlapping transactions through this one client are two SQLite connections on the file. Measured against this ticket's committed `SqliteSpaceRepository`: two overlapping `loadAggregate`s, and two overlapping first `initializeAggregate`s, each lost one side to an immediate `SqlConnectionError: database is locked` (2–9ms). `loadAggregate` is a write transaction here because `lockMetaIdentity` issues a dummy `UPDATE`. In-process serialisation of repository transactions (16) is what closes that, not the one-runtime rule.

- [x] A separate SQLite contract, generated artifacts, migration history, and runtime exist beside PostgreSQL. Generated contracts are not shared or made conditional; they encode target codecs.
- [x] `revision` and `exported_revision` are canonical non-negative decimal TEXT. Application code continues to speak `bigint`; conversion to and from the decimal string happens only at the SQLite adapter boundary. INTEGER / `BigInt` columns are not used.
- [x] Space and Thing ids are minted with the process `newId` already injected at composition. The contract has no database-side UUID default.
- [x] Target selection is trusted server/CLI composition only — a distinct runtime entry or script. Requests cannot carry a filesystem path or connection string.
- [x] The SQLite adapter implements `initializeAggregate`, `loadAggregate`, `listSpaces`, and `loadSpace` with the same observable outcomes the shared `SpaceRepository` suite already requires of those operations. `commit`, `replaceAggregate`, and `markExported` may still refuse; startup and ordinary GET of Default Content must not need them.
- [x] Host composition runs the existing Meta establishment before serving. An uninitialized file becomes the Default Content Meta Space; an already-initialized file is left alone.
- [x] `GET` of the Space collection and `GET` of that Meta Space return the established aggregate. A normal close, process exit, and reopen against the same file still shows it.
- [x] The file lives at a stable application-owned local path. A missing or unwritable parent fails clearly. The runtime is closed on CLI/server shutdown and before test cleanup.
- [x] CI (or a local command the later SQLite job will run) emits/checks the SQLite contract, applies committed migrations, runs this ticket's tests against a temp file, verifies the live database, closes every handle, and removes the directory. PostgreSQL CI is unchanged.
- [x] No browser/WASM SQLite, no network filesystem, and no live PostgreSQL↔SQLite migration.

## Answer

A separate Prisma Next 0.16.0 SQLite contract, `migrations-sqlite/` history, and `createSqliteDatabase` factory sit beside PostgreSQL. Revisions are canonical decimal TEXT; `bigint` conversion lives only in `SqliteSpaceRepository`. Ids come from the process `newId`. `initializeAggregate`, `loadAggregate`, `listSpaces`, and `loadSpace` share the observable outcomes the existing suite requires of those doors. `commit` still returns `invalid-commit`; `replaceAggregate` and `markExported` throw — writes are ticket 16/17.

`createSqliteHttpRuntime` migrates, constructs one client per process, and establishes Meta from Default Content before serving. `GET /api/spaces` and `GET` of that Meta Space return the aggregate after close and reopen. `pnpm dev:sqlite` is the opt-in host on port 5177 (`SQLITE_PATH`, default `.scratch/sqlite/hyper.db`); default Vite remains PostgreSQL, including `pnpm preview`. A missing or unwritable parent fails at composition. Tests close the runtime before cleanup; the Vite host has no process-exit close hook, matching PostgreSQL.

CI job `sqlite` emits/checks the contract, migrates a temp file, runs this ticket's tests, verifies, and removes the directory. PostgreSQL CI is unchanged. No browser path, no WASM, no live migration.

Verified: `pnpm verify` exit 0; `pnpm test:integration:sqlite` 10/10.
