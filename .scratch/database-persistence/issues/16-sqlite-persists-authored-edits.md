# 16 — SQLite persists authored Edits

**What to build:** An authored Edit through the SQLite host survives reload at the same revision contract PostgreSQL already has, including values above `Number.MAX_SAFE_INTEGER`. A topology-preserving single-Space Edit and an integrity-affecting multi-Space change set both land atomically or not at all. The shared repository contract's commit cases pass on SQLite.

**Blocked by:** 15 — SQLite host opens the Meta Space.

**Status:** resolved

Ticket 14 showed that two deferred transactions on independent connections — including two scoped transaction connections from one client — can hold SHARED locks and then wait out the whole ~5.3s busy timeout, even when they write different Spaces, because the ORM `update` reads before it writes and rollback-journal locking is file-level. **Do not ship that.** In-process overlapping commits must be serialised so they never both sit in a deferred `BEGIN`. After that serialisation, different-Space writes both succeed; a same-Space stale expected revision is a conflict; identity collisions are rejections. Two processes on one live file remain 18.

The topology-preserving fast path is still about not taking the Meta identity row when the snapshot boundary is unchanged. SQLite may serialise writers at the process or file; that is not an excuse to take the Meta row on an ordinary Edit, and it is not an excuse to open a second deferred transaction.

- [x] `commit` on the SQLite adapter accepts the existing non-empty create/update/delete change set and returns the same result kinds PostgreSQL does: committed revisions and deleted ids, revision conflicts with current values, aggregate intake refusals, and invalid-commit rejections. It introduces no HTTP or transport concepts.
- [x] Overlapping commits inside one process are serialised. They do not each open a deferred transaction against the same file. A test that fires two in-process commits at different Spaces both succeed in well under the busy timeout; they do not mutually stall for ~5s.
- [x] A topology-preserving single-Space update keeps the unlocked fast path's observable behaviour: it does not serialise behind Meta when the snapshot boundary is unchanged, and a stale expected revision conflicts and writes nothing.
- [x] An integrity-affecting change set (Space Thing create/link/delete, Space create/delete, anything that moves the snapshot boundary) serialises on the singleton repository-state row's SQLite equivalent, runs complete aggregate intake, and either writes every participant or none of them.
- [x] Thing identities already owned by another Space are rejected rather than moved. Duplicate Space ids in one request are rejected. A proposed deletion that authoritative state still references is a conflict, not an aggregate refusal.
- [x] Revisions are canonical decimal TEXT as 14 chose. Application and HTTP continue to speak `bigint` / canonical decimal. Values `0`, `Number.MAX_SAFE_INTEGER`, `Number.MAX_SAFE_INTEGER + 1`, and `2^63 - 1` commit and reload losslessly. Nothing converts through `Number`.
- [x] `POST /api/spaces` against the SQLite host persists an Edit that a subsequent `GET` and a process reopen both return. Unexpected operational failure still maps to retryable `persistence-unavailable`; a revision mismatch is 409, not 503.
- [x] The shared `SpaceRepository` behavioural suite's commit cases run against SQLite. Dialect-specific error classification stays in the SQLite adapter; do not teach PostgreSQL's primary-key helper to recognise SQLite names.
- [x] Ordinary memory unit/E2E repositories are not replaced. Browser chrome is unchanged.

## Answer

`SqliteSpaceRepository.commit` accepts the same change set PostgreSQL does and returns the same result kinds. Topology-preserving single-Space updates still skip the Meta identity row; integrity-affecting change sets lock `repository_state`, run complete aggregate intake, and write every participant or none. Every repository operation in the process — `listSpaces`, `loadSpace`, `loadAggregate`, `initializeAggregate`, and `commit` — goes through one queue, so overlapping transactions never both sit in a deferred `BEGIN`. The plain reads are in it too (found on review): the pinned driver gives each read its own `DatabaseSync` handle and streams rows across promise turns, so a read held SHARED while a queued commit's `COMMIT` busy-waited synchronously on the event loop, and the commit — not the read — failed with `Transaction commit failed` / `database is locked` after ~5.4s. Reproduced only under a continuous stream of `loadSpace` + `listSpaces` across 300 linked Spaces during the commit; a single burst of reads stayed green. The regression test is the "overlapping a … commit" loop in `test/integration/sqlite-space-repository.test.ts`. Different-Space commits both succeed well under the busy timeout; a stale same-Space revision conflicts.

Revisions stay canonical decimal TEXT at the adapter edge. `Number.MAX_SAFE_INTEGER + 1` commits and reloads as `bigint` / stored decimal. `POST /api/spaces` persists an Edit that GET and reopen return; a stale expected revision is 409.

Commit and domain rules are decided once, in `src/persistence/commit-decision.ts`, which both the SQLite and PostgreSQL adapters call; each adapter keeps only its reads, locks, writes and its own error classification. The shared suite runs against SQLite with `excludes: 'replacement-and-export'`, which skips (visibly) only the cases that need `replaceAggregate` or `markExported`; every initialization case runs, including the concurrent one. A closed database answers every route as 503 `persistence-unavailable`, retryable at `HttpSpaceBackend` (`test/integration/sqlite-http-runtime.test.ts`). `replaceAggregate` and `markExported` remain ticket 17. Two processes on one live file remain ticket 18.

Verified: `pnpm test:integration:sqlite` 43 passed, 8 skipped (51), the HTTP runtime's four included. Memory runs every contract case.
