# 16 — SQLite persists authored Edits

**What to build:** An authored Edit through the SQLite host survives reload at the same revision contract PostgreSQL already has, including values above `Number.MAX_SAFE_INTEGER`. A topology-preserving single-Space Edit and an integrity-affecting multi-Space change set both land atomically or not at all. The shared repository contract's commit cases pass on SQLite.

**Blocked by:** 15 — SQLite host opens the Meta Space.

**Status:** ready-for-agent

Ticket 14 showed that two deferred transactions on independent connections — including two scoped transaction connections from one client — can hold SHARED locks and then wait out the whole ~5.3s busy timeout, even when they write different Spaces, because the ORM `update` reads before it writes and rollback-journal locking is file-level. **Do not ship that.** In-process overlapping commits must be serialised so they never both sit in a deferred `BEGIN`. After that serialisation, different-Space writes both succeed; a same-Space stale expected revision is a conflict; identity collisions are rejections. Two processes on one live file remain 18.

The topology-preserving fast path is still about not taking the Meta identity row when the snapshot boundary is unchanged. SQLite may serialise writers at the process or file; that is not an excuse to take the Meta row on an ordinary Edit, and it is not an excuse to open a second deferred transaction.

- [ ] `commit` on the SQLite adapter accepts the existing non-empty create/update/delete change set and returns the same result kinds PostgreSQL does: committed revisions and deleted ids, revision conflicts with current values, aggregate intake refusals, and invalid-commit rejections. It introduces no HTTP or transport concepts.
- [ ] Overlapping commits inside one process are serialised. They do not each open a deferred transaction against the same file. A test that fires two in-process commits at different Spaces both succeed in well under the busy timeout; they do not mutually stall for ~5s.
- [ ] A topology-preserving single-Space update keeps the unlocked fast path's observable behaviour: it does not serialise behind Meta when the snapshot boundary is unchanged, and a stale expected revision conflicts and writes nothing.
- [ ] An integrity-affecting change set (Space Thing create/link/delete, Space create/delete, anything that moves the snapshot boundary) serialises on the singleton repository-state row's SQLite equivalent, runs complete aggregate intake, and either writes every participant or none of them.
- [ ] Thing identities already owned by another Space are rejected rather than moved. Duplicate Space ids in one request are rejected. A proposed deletion that authoritative state still references is a conflict, not an aggregate refusal.
- [ ] Revisions are canonical decimal TEXT as 14 chose. Application and HTTP continue to speak `bigint` / canonical decimal. Values `0`, `Number.MAX_SAFE_INTEGER`, `Number.MAX_SAFE_INTEGER + 1`, and `2^63 - 1` commit and reload losslessly. Nothing converts through `Number`.
- [ ] `POST /api/spaces` against the SQLite host persists an Edit that a subsequent `GET` and a process reopen both return. Unexpected operational failure still maps to retryable `persistence-unavailable`; a revision mismatch is 409, not 503.
- [ ] The shared `SpaceRepository` behavioural suite's commit cases run against SQLite. Dialect-specific error classification stays in the SQLite adapter; do not teach PostgreSQL's primary-key helper to recognise SQLite names.
- [ ] Ordinary memory unit/E2E repositories are not replaced. Browser chrome is unchanged.
