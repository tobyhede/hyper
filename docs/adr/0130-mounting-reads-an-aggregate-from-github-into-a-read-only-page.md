# Mounting reads an aggregate from GitHub into a read-only page

Status: accepted
Related: 0069, 0078, 0109, 0117, 0118, 0124

A static copy of the application can show a talk that lives in a public GitHub repository, with no server, database or per-talk copy of the application. **Mounting** reads a complete aggregate from a **GitHub location**, `github:owner/repo@ref/path`, when the page opens. It keeps that aggregate in a store inside the page, and the page answers its own HTTP API from that store. Everything that reads, navigates and presents works. No Edit is offered or accepted, because there is nowhere to make one durable.

## The decision

- **GitHub is the only source.** There is no packed file and no build step that copies the talk. `ref` defaults to the repository's default branch and `path` to its root. The ref runs from `@` to the next `/`, so a ref never contains `/`: a branch named `feature/x` is addressed by its commit SHA or a tag, and `github:owner/repo/path` selects a directory on the default branch. The location resolves to a commit once per page: a branch costs one API call to resolve, and listing the tree at that commit costs one more. The files Importing reads are then fetched at that commit from `raw.githubusercontent.com`, which the API's 60-an-hour limit does not govern but which does throttle heavy use, so blobs are fetched with bounded concurrency and a throttled one is retried. Public repositories only, and no token is ever used.
- **The selected directory bounds the aggregate.** It must directly contain `hyper.json` and is the base for every aggregate file. A repository may contain unrelated material and several independent aggregates. `hyper.json` names Meta; it is not a file inventory. The existing Import discovery rules find the remaining files within that directory, without recursively searching for aggregates or reading siblings.
- **Every successful mount records its complete resolved source in the address,** including the repository, directory and commit SHA, even when the location came from the build-time default. `history.replaceState` updates `source` only when it differs. A reload, a shared link and the Notes window all read the same commit after the deployment default changes. The bare domain opens the current deployment default.
- **Mounted presentation communication is scoped by resolved repository, directory, commit and Space ID.** Two revisions sharing a Space ID on the same origin cannot follow or control each other. Windows of the same resolved source and Space keep the existing presentation-following behavior.
- **One build, with an optional default.** A build-time setting names a default GitHub location. A `source` query parameter overrides it on every deployment, a pinned one included, and every product URL keeps the parameter: a talk's domain will mount any public aggregate a link names, which is accepted because a mount is read-only and reads only public repositories. The talk's own domain is that build with its default pinned to a commit, so each load costs one API call and a deploy means bumping that commit. With no default and no parameter, the page asks for a location.
- **The seam is the browser's `SpaceBackend`.** Mounting gives `createSpaceStartup` an `HttpSpaceBackend` whose `fetch` dispatches to the Space HTTP application in the page, over a memory repository holding the read aggregate. The same intake, commit decision, working-space loader and destination resolution answer every request, so a mounted talk behaves like a Running one.
- **The directory reader has a pure core.** It reads an aggregate from a map of relative paths to bytes, with no `node:` import. The filesystem shell under root `src/` feeds it from disk, and the GitHub source feeds it from fetched blobs. Anything the CLI refuses, the browser refuses in the same words.
- **Browser-reachable modules move into a browser-safe package**: the reader core, the aggregate lifecycle, the memory repository and the product resolution the Space host performs. Root `src/` keeps the filesystem and the CLI. The narrowed tsconfig paths and lint zones stay enforced.
- **Read-only is an answer of the whole session, not a Map surface policy.** Authoring availability gains a mounted answer that withholds every Edit and keeps selecting, navigating, Entering, Exiting and Present. The `read-only` Map surface policy keeps meaning a drawn embedding that is not yours. It withholds Present and every node gesture, which would leave a mounted talk unpresentable. The in-page HTTP application refuses every write the page sends as well. The first working load of a mapless Space (`maps-and-graphs.md` R16) is not such a write: the working-space loader makes it inside the in-page host while answering a read, so a mapless Meta Space opens, with its empty Map held only for the page's lifetime.
- **Open and Closed stay as authored.** Opening is a Map Edit (ADR 0064), so a mounted talk shows each Resource Open or Closed as its directory does. A reader reads a Closed Resource on the Stage.
- **Read-only is shown as its own mark,** not as a persistence status. A mounted session never commits, so it never reports `Persisted` or any other persistence state.
- **`/` resolves in the client** to the Meta Space's address, which on a server is the host's redirect. A talk that should open on its slides makes the talk's Space its Meta Space.
- **Stored images resolve to object URLs** over the fetched bytes, through one display resolver supplied at composition. On a server that resolver is the identity, and ADR 0118's naming is unchanged.

## Exceptions this makes

- **The browser reads an aggregate.** That is against `editing-and-persistence.md`'s rule that the browser never parses one. Here it happens only inside a mount composition that no server shares.
- **The in-page store is established through the lifecycle door ADR 0078 keeps off the browser seam,** inside that same composition.
- **An unknown product URL is answered by the application and its "not found" destination,** not by an HTTP 404 (against ADR 0069 and `navigation.md`). A static host serves the application for every path.
- **ADR 0117's "Exporting is what makes an edit durable" has no edit to apply to.** Mounting is neither Importing, because it never touches the stored aggregate, nor Running, because it writes nothing back.

## Rejected

- **An Aggregate pack beside the build.** It survives GitHub being down at the venue and serves private repositories, but it adds a file format and a build step per talk. The talk's repository is made public instead, and `pnpm hyper run` on the author's machine is the fallback when the venue network fails.
- **A path prefix for the location** (`/github/owner/repo/tree/ref/path/...`). Every destination resolver would have to learn a base path, while a query parameter leaves product URLs as they are.
- **Implementing `SpaceBackend` over `MemorySpaceBackend` directly.** It skips the whole-aggregate check, the working-space loader and the image store, so a mounted Space would behave differently from a Running one.
- **Reusing the `read-only` Map surface policy for the whole session.** It withholds Present and selection, as above.
- **Ephemeral Edits in the tab.** They look like work that is then lost.
- **Leaving an inherited default out of a copied URL.** It would make the destination depend on a later deployment rather than preserve the revision the reader shared.
- **Scoping mounted Notes communication only by Space ID.** Revisions preserve Space IDs, so presenting one revision could redirect the Notes window of another.
- **A token or a proxy for private repositories.**

## Cost accepted

- **Talk day depends on GitHub and the venue's network.**
- **GitHub allows 60 unauthenticated API requests an hour per IP.** A room on one shared address can use that up against a branch. A commit-pinned default spends one call per load.
- **An audience member cannot Open a Closed Resource on the canvas.**
