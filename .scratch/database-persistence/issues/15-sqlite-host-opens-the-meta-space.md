# 15 — SQLite host opens the Meta Space

**What to build:** A file-backed SQLite database that a Hyper host can start against: migrated, Meta established from Default Content, collection and Meta Space readable over the existing `/api/spaces` resources, and still there after close and reopen. PostgreSQL remains the default. The browser does not change and never names a database path. Authored writes may still fail.

**Blocked by:** 14 — Spike SQLite driver and revision storage (resolved; GO on TEXT revisions, Prisma Next 0.16.0).

**Status:** ready-for-agent

Ticket 14's composition constraint is in force from this ticket, not deferred to 18: **one SQLite runtime per process**, constructed once at composition the way PostgreSQL already is. Do not open a second independent client against the same live file from inside the host (tests, CLI helpers, or a second `sqlite()` call). Overlapping writers and two-process contention are 16 and 18.

- [ ] A separate SQLite contract, generated artifacts, migration history, and runtime exist beside PostgreSQL. Generated contracts are not shared or made conditional; they encode target codecs.
- [ ] `revision` and `exported_revision` are canonical non-negative decimal TEXT. Application code continues to speak `bigint`; conversion to and from the decimal string happens only at the SQLite adapter boundary. INTEGER / `BigInt` columns are not used.
- [ ] Space and Thing ids are minted with the process `newId` already injected at composition. The contract has no database-side UUID default.
- [ ] Target selection is trusted server/CLI composition only — a distinct runtime entry or script. Requests cannot carry a filesystem path or connection string.
- [ ] The SQLite adapter implements `initializeAggregate`, `loadAggregate`, `listSpaces`, and `loadSpace` with the same observable outcomes the shared `SpaceRepository` suite already requires of those operations. `commit`, `replaceAggregate`, and `markExported` may still refuse; startup and ordinary GET of Default Content must not need them.
- [ ] Host composition runs the existing Meta establishment before serving. An uninitialized file becomes the Default Content Meta Space; an already-initialized file is left alone.
- [ ] `GET` of the Space collection and `GET` of that Meta Space return the established aggregate. A normal close, process exit, and reopen against the same file still shows it.
- [ ] The file lives at a stable application-owned local path. A missing or unwritable parent fails clearly. The runtime is closed on CLI/server shutdown and before test cleanup.
- [ ] CI (or a local command the later SQLite job will run) emits/checks the SQLite contract, applies committed migrations, runs this ticket's tests against a temp file, verifies the live database, closes every handle, and removes the directory. PostgreSQL CI is unchanged.
- [ ] No browser/WASM SQLite, no network filesystem, and no live PostgreSQL↔SQLite migration.
