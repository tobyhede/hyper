# 05 — Mount addressing

Status: resolved

**What to build:** where a mounted page gets its GitHub location, and how the location stays in the address (ADR 0130).

- The location is the `source` query parameter, else a build-time default, else the page asks for one. Asking for a location is a small form, built with the `shadcn-first-ui` skill.
- Product URLs do not change. The browser-location module carries `source` across every history write it makes, and a destination resolver never sees it.
- Every successful mount writes the complete resolved GitHub location from 04, with a commit SHA, into `source` using `history.replaceState`, including when the location came from the build-time default. Replace the address only when it differs. A reload, a shared link and the Notes window then read the same commit even after a deployment changes the default, and the page shows which commit it is reading. The bare domain opens the current deployment default.
- The Notes window opened from a mounted page mounts the same `source`. Scope mounted presentation communication by resolved repository, directory, commit and Space ID. Two revisions of the same Space on the same origin cannot follow or control each other; windows of the same resolved source and Space keep the existing following behavior.
- That scoping lives in `packages/app/src/browser-presentation-channel.ts`. There, `presentationChannelName(spaceId)` names the one `BroadcastChannel` per Space, and in a mounted session it also takes the resolved source. A server session keeps today's name. The presence lock, `presentationPresenceName`, is already keyed by a minted presentation id and needs no change.

**Depends on:** 02, 04.

**Acceptance:**

- `packages/app/test/browser-location.test.ts`: `source` survives a Map move, a Graph move, Present, Enter and a browser traversal, and both explicit locations and build-time defaults become complete commit-pinned locations in the address without a redundant history replacement.
- A test shows the build-time default used when `source` is absent and overridden when it is present.
- A copied URL still mounts its original commit after the deployment default changes. Opening the bare domain uses the new default.
- Mounted Notes tests open two revisions with the same Space ID on the same origin: each Notes window follows and controls only its own revision. Windows of the same resolved source and Space still follow normally.

## Answer

Built as modules with injected inputs, then wired into 02's mount composition.

- `packages/app/src/source-parameter.ts`: `sourceParameter(href)` reads the `source` query parameter of an absolute URL, or `null`. `withSource(path, source)` writes `path?source=…`, leaving the location's `:`, `/` and `@` unescaped so a shared link reads as the location, or `path` alone when `source` is `null`.
- `packages/app/src/browser-location.ts` carries the current location's `source` after every product path it writes: push and replace, so Map and Graph moves, Present, Enter, Exit and opening an address, and also Copy link's `href`. Destination resolution still reads the pathname alone, so no resolver sees `source`, and a traversal keeps it because the browser restores the entry's whole URL. It carries no other query. Without `source` every write is the bare product path, as before.
- `packages/app/src/mount/mount-source.ts`: `resolveMountSource(source, buildDefault)` answers `{ kind: 'mount', location, from: 'parameter' | 'default' }` or `{ kind: 'ask', failure }`. The parameter wins over the default. A parameter or default that does not parse is asked about with its `malformed-location` failure rather than passed over. `pinSource(history, resolved)` writes `formatGitHubLocation(resolved)` into `source` with `history.replace` on the session's one `HistoryApi`, only when the address does not already name it, and answers whether it wrote.
- `packages/app/src/browser-presentation-channel.ts`: `presentationChannelName(spaceId, scope?)` adds the scope to the name, and `createBrowserPresentationLinks` takes an optional `scope`, defaulting to none. A server session keeps `hyper-presentation:<spaceId>`.
- `packages/app/src/components/GitHubLocationForm.tsx`: `GitHubLocationForm({ navigate, failure })` asks for a location, validates it with `parseGitHubLocation`, and calls `navigate('?source=…')`, or shows the parser's reason as a `FieldError`. It composes `@project/ui` only, and is listed in `uncataloguedComponents` until 06 renders it.

Tests: "the mounted source in the address" and "pinning the mounted source" in `packages/app/test/browser-location.test.ts`, `packages/app/test/mount-source.test.ts` (including a copied commit surviving a moved default), the channel names in `packages/app/test/browser-presentation-channel.test.ts`, "mounted revisions of one Space on one origin" in `packages/app/test/presentation-link.test.ts` over a name-keyed in-memory channel, and `packages/app/test/GitHubLocationForm.test.tsx`.

Wiring into the mount composition:

- `packages/app/src/mount/mounted-startup.ts`: `createMountedStartup({ location, fetch, newId, createObjectUrl, fullscreen, presentations, history })` takes the `GitHubLocation` `resolveMountSource` answered and the page's `fetch`, reads it with `readGitHubLocation` (`github-source.ts`, which `readGitHubAggregate` now parses into), and mounts its files under the resolved location's name, so the reader's diagnostics name `github:owner/repo@sha/hyper.json`. A GitHub failure is thrown as `describeGitHubSourceFailure`'s sentence and an aggregate refusal as `describeMountRefusal`'s, so both reach the application's own startup failure. Tests stay on files: their `fetch` is `test/fake-github.ts`, a fake repository over a path-to-bytes map, shared with `github-source.test.ts`.
- After the mount, every resolve pins the source on the one `HistoryApi` handed to `createSpaceStartup`: `pinSource` for a product path, and at `/` the one `replace` that moves the address to the Meta Space carries the pinned `source` itself, so the root is written once rather than twice.
- `presentations` is a function of the scope: the composition calls it once, with `formatGitHubLocation(resolved)`, after the location resolves, so the entry builds `createBrowserPresentationLinks({ …, scope })` then. A server session's `main.tsx` is unchanged.
- `openNotes` in `compose-app.ts` opens `addressOf({ kind: 'notes', … })`. `addressOf` is a new optional `composeApp` dependency defaulting to `productDestinationPath`, and Open Spaces passes the browser location's `href`, the seam Copy link and Open in new tab already use, so a mounted Notes window carries `source` and a server one opens the same path as before.

Tests: "mounting an aggregate in the page" in `packages/app/test/mount.test.tsx` covers a branch pinned to its commit at a product path, a build-time default pinned at `/` in one write, no write when the address already names the commit, the links scoped by the resolved location, the Notes window opened at the pinned `source`, a rate-limited answer and a missing `hyper.json` shown as the startup failure.

The end-to-end acceptance (a copied URL in a real browser, Notes windows in Playwright) is 06's.
