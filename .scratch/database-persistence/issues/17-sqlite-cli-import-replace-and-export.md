# 17 — SQLite CLI import, replace, and export

**What to build:** `hyper <aggregate>` and `hyper export` against SQLite have the same lifecycle outcomes as PostgreSQL. An empty file initializes; `--dangerous-truncate` replaces under the expected Meta identity; a stale replace conflicts; a successful export records `markExported` at the projected revision. The canonical directory format does not change.

**Blocked by:** 16 — SQLite persists authored Edits.

**Status:** ready-for-agent

The CLI is a second process. Ticket 14 showed two independent clients **in one process** on one live file can stall for the busy timeout even on disjoint rows; a second *process* was never measured, and because `node:sqlite` busy-waits synchronously, the in-process numbers do not transfer to it without being measured. **Do not require the CLI and a running host to share a live file.** Operator rule: the host is stopped, or CLI points at a file the host does not have open. A CLI that does hit a held file must fail as BUSY/LOCKED (`SqlConnectionError` transient — retryable, whether SQLite returns it immediately or after the 5000ms busy timeout), not as a revision conflict. Proving that classification is 18; this ticket only has to not pretend concurrent CLI+host writers are in scope.

- [ ] CLI target composition can construct the SQLite adapter and close it. Command syntax need not change except for the chosen trusted target-selection mechanism. The browser still cannot name the lifecycle doors.
- [ ] `initializeAggregate` on an uninitialized SQLite file establishes the supplied complete aggregate, assigns fresh revisions, and returns `initialized`. An identical concurrent proposal returns `existing` (in one process this needs the repository's in-process serialisation; unserialised, ticket 14's review measured the second proposal failing as an immediate `database is locked` instead). A different proposal against an already-initialized file returns `already-initialized` and overwrites nothing.
- [ ] `replaceAggregate` on an uninitialized file returns `uninitialized` rather than establishing first state. A matching expected Meta identity atomically replaces every Space and the singleton identity. A stale expected Meta identity returns `conflict` with the current Meta id.
- [ ] Spaces without Meta, Meta naming a missing Space, and a stored aggregate that fails complete intake remain invariant failures, not empty states and not values either door repairs. Invalid proposed aggregates return structured intake refusals.
- [ ] `hyper export` against SQLite writes the same versioned aggregate directory PostgreSQL does, then `markExported` for each captured Space revision. A `markExported` after a later Edit still records the projected revision rather than the current one. Interruption must not record a revision against bytes that did not land.
- [ ] Canonical directory import/export is the only PostgreSQL↔SQLite bridge. There is no live dump, no merge mode, and no Space-scoped export.
- [ ] Integration coverage runs the existing CLI lifecycle behaviours against a temp SQLite file the test process owns alone: initialize, refuse a second different initialize, replace with the flag, conflict on a stale Meta id, export then reopen.
