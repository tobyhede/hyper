# A mounted talk keeps its edits in the browser

Status: accepted
Refines: 0130, 0131
Related: 0078, 0095, 0106

ADR 0131 makes a mounted talk editable over the in-page `MemorySpaceRepository`, and a reload reads the talk from GitHub again, so every edit is lost with the page. This decision keeps a mounted talk's edits in the browser that made them, across reloads and tabs, while the talk still opens as committed until someone edits it. It changes where the in-page store keeps its state and nothing about what the session offers.

## The decision

- **The in-page store is an IndexedDB `SpaceRepository`.** It implements the whole seam, images included (ADR 0106), and lives in `@project/aggregate` beside `MemorySpaceRepository`. It is held to the same shared contract test, run under Node over `fake-indexeddb`. A commit is decided inside one IndexedDB transaction by `decideCommit`, so a stale writer gets the ordinary revision conflict. It is not a snapshot of `MemorySpaceRepository` written after each commit, which would let one tab silently overwrite another's whole aggregate.
- **A stored copy is scoped by resolved repository, directory and commit,** the scope ADR 0130 gives mounted presentation communication. Each scope is its own database. A new commit opens an empty scope and starts clean. A copy kept for an older commit is shown again only when that same commit is mounted again, as a `source` pinned to it does, and otherwise stays in storage until the browser or the person clears it.
- **Mounting establishes the store through `initializeAggregate` as before.** An empty scope is initialized from GitHub; a scope already holding a copy answers `existing` when that copy still matches the files and `already-initialized` when it does not, and the mount opens the stored copy on either answer. GitHub is still read on every load, because the commit and the files are what name the scope and check the copy against.
- **The talk opens as committed until it is edited.** While the stored copy's authored content differs from the copy the mount first established, the Command Dock marks the talk **Edited in this browser**; a copy whose edits were all undone matches again and shows no mark. The first copy is the files read from GitHub with the first working load of a mapless Space (`maps-and-graphs.md` R16), which the in-page host makes while it answers a read, so that load is not an edit. The scope keeps that first copy beside the stored one, because a copy that differs from the files is not necessarily edited. Authored content is the Meta Space and each Space's snapshot, as `initializeAggregate` compares them; a revision is commit bookkeeping and never counts, or every commit would leave the mark set. The mark replaces ADR 0131's "Edits lost on reload", which stops being true once edits survive a reload, so a mounted talk that has not been edited shows no mark. **Discard local edits** deletes the scope's database and mounts again from GitHub.
- **Persistent storage is requested on the first edit,** through `navigator.storage.persist()`, and never on load, so a reader who never edits is never asked. The request is best effort: the edit has already committed whether `persist()` grants, refuses, rejects or is missing, and only the risk that the browser evicts the copy changes.
- **Two tabs of one scope are two sessions over one store.** A tab whose revision is stale gets the ordinary conflict on its next commit, as two browsers on one `pnpm dev` host do. Nothing broadcasts a commit to the other tab.
- **Edits stay in the browser.** Nothing writes to GitHub, and this decision adds no way to take an edited aggregate out of the page; the Dock mark says where the edits are.

## Exceptions this makes

- **Browser storage holds an aggregate.** The rule that the repo is the only source of state (`AGENTS.md`, "State") governs development, CI and the repository's own stores. A mounted talk's local copy is state a reader made in their own browser, outside the repository, and nothing in the repository reads it.

## Rejected

- **Memory only** (ADR 0131's choice for its own change). Every edit is lost on reload, which makes a mount useless for preparing a talk.
- **A snapshot of the memory repository written after each commit.** Simple, but two tabs overwrite each other whole and silently.
- **`SqlSpaceRepository` on SQLite in wasm over OPFS.** It would be ADR 0095's third host, at the cost of a large wasm dependency and an unverified driver.
- **localStorage.** Synchronous, strings only and about 5 MB, too small once images are stored.
- **A copy scoped by repository and directory only.** It survives a new commit, and hides every upstream change behind local edits.
- **Live refresh of other tabs through a BroadcastChannel.** A behaviour no unmounted session has.
- **A download or folder write of the edited aggregate in this change.** It needs a browser-safe Export writer; it is ticketed separately.

## Cost accepted

- **Edits are trapped in one browser profile** until an edited aggregate can be taken out of the page.
- **The browser may evict the copy** if persistent storage is refused.
- **A copy for an older commit is orphaned** when the talk moves to a new one, unless that commit is mounted again.
