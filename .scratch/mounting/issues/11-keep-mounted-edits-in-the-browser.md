# 11 — Keep a mounted talk's edits in the browser

Status: needs-triage

**What to build:** ADR 0132. A mounted talk's in-page store keeps its state in IndexedDB, scoped by resolved repository, directory and commit, so edits survive a reload and are shared by tabs of the same scope.

- **`IndexedDbSpaceRepository`** in `packages/aggregate/src/`, implementing `SpaceRepository` (images included) over one database per scope. It decides commits with `decideCommit` inside one readwrite transaction, raises `AggregateInvariantError` for broken stored state and `PersistenceUnavailableError` when IndexedDB will not open, as the seam requires of every implementation (`packages/persistence/src/repository.ts`). Exported from the package index.
- **The shared contract** in `test/unit/memory-space-repository.test.ts` runs over the new repository too, under `fake-indexeddb` (a new dev dependency). Where the memory repository's `withoutMetaIdentity` sets up a state no seam call reaches, the IndexedDB repository needs its own named way in, or the case is answered for it in the ticket.
- **`mountAggregate`** (`packages/app/src/mount/mount.ts`) takes the repository from its caller rather than constructing `MemorySpaceRepository`, and treats both `existing` and `already-initialized` from `initializeAggregate` as a mount of the stored copy instead of throwing: a copy with edits, or with a first working load, no longer matches the files and answers `already-initialized`. Images are stored only when the scope is initialized. `mounted-startup.ts` opens the scope's database from the resolved source.
- **The edited mark**: the Dock's `Badge` reads **Edited in this browser** while the stored aggregate's authored content (`metaSpaceId` and each Space's `snapshot`, compared as `classifyInitializedAggregate` does, never `revision` or `exportedRevision`) differs from the scope's first copy, which is the aggregate as initialized from GitHub together with its R16 first working load, kept in the scope beside it. It is recomputed after each commit and on load, so a reload of an edited talk shows it and undoing every edit removes it. It replaces ADR 0131's "Edits lost on reload" (`UnsavedMark` in `packages/app/src/components/CommandDock.tsx`), which a mounted talk no longer shows. Use the `shadcn-first-ui` skill.
- **Discard local edits**: deletes the scope's database and mounts again from GitHub. Offered only while the mark is shown.
- **Persistent storage**: `navigator.storage.persist()` on the first stored write, once per page, never on load, and best effort: a missing `navigator.storage`, a rejection or `false` changes nothing about the commit. Injected at composition so tests do not reach the browser global.

**Depends on:** ADR 0131's editable mounts, merged to `main`.

**Acceptance:**

- The shared repository contract passes for the IndexedDB repository.
- A mount test: an edit, then a fresh mount of the same scope, shows the edit; a mount of another commit does not.
- A mount test: two mounts of one scope, the second commits on a stale revision and gets a conflict.
- A mount test: a mapless Meta Space opens with no edited mark, and a reload still shows none; an edit shows it; undoing that edit removes it; Discard removes the edit and the mark.
- No mounted session shows "Edits lost on reload".
- `persist` is asked on the first write and never on a read-only load, and the first write commits when `persist` is missing, rejects or answers `false`.
- `pnpm e2e:mount` covers an edit surviving a reload.

**Land after** the 2026-10-30 talk.
