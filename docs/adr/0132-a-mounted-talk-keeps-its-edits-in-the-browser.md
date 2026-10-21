# A mounted talk keeps its edits in the browser

Status: accepted
Related: 0078, 0095, 0106, 0130, 0131

ADR 0131 makes a mounted talk editable over the in-page `MemorySpaceRepository`, and a reload reads the talk from GitHub again, so every edit is lost with the page. This decision keeps a mounted talk's edits in the browser that made them, across reloads and tabs, while the talk still opens as committed until someone edits it. It changes where the in-page store keeps its state and nothing about what the session offers.

## The decision

- **The in-page store is an IndexedDB `SpaceRepository`.** It implements the whole seam, images included (ADR 0106), and lives in `@project/aggregate` beside `MemorySpaceRepository`. It is held to the same shared contract test, run under Node over `fake-indexeddb`. A commit is decided inside one IndexedDB transaction by `decideCommit`, so a stale writer gets the ordinary revision conflict. It is not a snapshot of `MemorySpaceRepository` written after each commit, which would let one tab silently overwrite another's whole aggregate.
- **A stored copy is scoped by resolved repository, directory and commit,** the scope ADR 0130 gives mounted presentation communication. Each scope is its own database. A new commit opens an empty scope and starts clean; a copy kept for an older commit is never shown again, and stays in storage until the browser or the person clears it.
- **Mounting establishes the store through `initializeAggregate` as before.** An empty scope is initialized from GitHub; a scope already holding a copy answers `existing`, and the mount opens that copy. GitHub is still read on every load, because the commit and the files are what name the scope and check the copy against.
- **The talk opens as committed until it is edited.** Once the page has stored a write it sent, the Command Dock shows that the talk is edited in this browser, beside ADR 0131's mark. The first working load of a mapless Space (`maps-and-graphs.md` R16) is made by the in-page host while it answers a read, so it is not an edit and shows no mark. **Discard local edits** deletes the scope's database and mounts again from GitHub.
- **Persistent storage is requested on the first edit,** through `navigator.storage.persist()`, and never on load, so a reader who never edits is never asked. Its refusal changes nothing but the risk that the browser evicts the copy.
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
- **A copy for an older commit is orphaned** when the talk moves to a new one.
