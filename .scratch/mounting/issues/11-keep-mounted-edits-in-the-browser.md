# 11 — Keep a mounted talk's edits in the browser

Status: needs-triage

**What to build:** ADR 0132. A mounted talk's in-page store keeps its state in IndexedDB, scoped by resolved repository, directory and commit, so edits survive a reload and are shared by tabs of the same scope.

- **`IndexedDbSpaceRepository`** in `packages/aggregate/src/`, implementing `SpaceRepository` (images included) over one database per scope. It decides commits with `decideCommit` inside one readwrite transaction, raises `AggregateInvariantError` for broken stored state and `PersistenceUnavailableError` when IndexedDB will not open, as the seam requires of every implementation (`packages/persistence/src/repository.ts`). Exported from the package index.
- **The shared contract** in `test/unit/memory-space-repository.test.ts` runs over the new repository too, under `fake-indexeddb` (a new dev dependency). Where the memory repository's `withoutMetaIdentity` sets up a state no seam call reaches, the IndexedDB repository needs its own named way in, or the case is answered for it in the ticket.
- **`mountAggregate`** (`packages/app/src/mount/mount.ts`) takes the repository from its caller rather than constructing `MemorySpaceRepository`, and treats `existing` from `initializeAggregate` as a mount of the stored copy instead of throwing. Images are stored only when the scope is initialized. `mounted-startup.ts` opens the scope's database from the resolved source.
- **The edited mark**: set once the in-page application has stored a write the page sent (a successful non-`GET`/`HEAD` request), and read back on load from the store, so a reload of an edited talk shows it. The R16 first working load commits inside a read and does not set it. Draw it in the Command Dock with ADR 0131's mark; use the `shadcn-first-ui` skill.
- **Discard local edits**: deletes the scope's database and mounts again from GitHub. Offered only while the mark is shown.
- **Persistent storage**: `navigator.storage.persist()` on the first stored write, once per page, never on load. Injected at composition so tests do not reach the browser global.

**Depends on:** ADR 0131's editable mounts, merged to `main`.

**Acceptance:**

- The shared repository contract passes for the IndexedDB repository.
- A mount test: an edit, then a fresh mount of the same scope, shows the edit; a mount of another commit does not.
- A mount test: two mounts of one scope, the second commits on a stale revision and gets a conflict.
- A mount test: a mapless Meta Space opens with no edited mark; an edit shows it; Discard removes the edit and the mark.
- `persist` is asked on the first write and never on a read-only load.
- `pnpm e2e:mount` covers an edit surviving a reload.

**Land after** the 2026-10-30 talk.
