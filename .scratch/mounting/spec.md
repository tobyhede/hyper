Status: ready-for-agent

# Mounting an aggregate from GitHub in a static host

## Problem Statement

An author who has written a talk as an Aggregate directory can show it only by Running it on their own machine (`pnpm hyper run <dir>`), or through a host with a database behind it. There is no way to put a talk on the web at its own address so that an audience, or the author on a borrowed machine, opens a URL and finds the talk's Space already in the application, ready to present. Running Hyper's HTTP API on a public server would let anyone who can reach it rewrite the talk, because `POST /api/spaces` and `POST /images` are unauthenticated, and a memory store behind it would be neither shared nor durable.

The author wants this for any talk kept in a public GitHub repository: deploy one static copy of Hyper, and have it load the talk directly from a GitHub location, with no server of their own, no database and no per-talk copy of the talk's files.

The first instance is the PG Down Under 2026 talk, "Searchable Encryption with Postgres Types", whose Aggregate directory is the root of `tobyhede/pgdu-2026-searchable-encryption-postgres-types` and which is to be served at `pgdu.tobyhede.com` from Cloudflare. That repository is made public for this.

## Solution

**Mounting** (ADR 0130): when the page opens, the browser application reads a complete aggregate from a **GitHub location**, `github:owner/repo@ref/path`. It keeps that aggregate in a store inside the page and serves the application's own API to itself from that store, so the application runs unchanged on a static host. A mounted aggregate is read-only. Everything that reads, navigates and presents works, and nothing offers an Edit.

The GitHub location resolves `ref` (default: the repository's default branch) to a commit, lists the tree of `path` (default: the root) at that commit, which costs one API request at the root and two in a subdirectory, keeps the files Importing reads there, and fetches each one at that commit from `raw.githubusercontent.com`. The selected `path` must directly contain `hyper.json`; its directory is the base for every aggregate file. A repository may contain unrelated material and several independent aggregates. `hyper.json` names the Meta Space rather than listing files: the existing Import discovery rules determine the remaining files within the selected directory, without recursively searching for aggregates or reading sibling aggregates. The result is a map from the Aggregate directory's relative paths to bytes, read by the same directory reader the CLI uses. So the repository as it exists today mounts without conversion, and anything the CLI refuses is refused the same way in the browser.

One static build serves every talk. A build-time setting names a default GitHub location, and a `source` query parameter overrides it. `pgdu.tobyhede.com` is that build with its default pinned to a commit of the talk repository. With neither a default nor a parameter, the page asks for a location.

## User Stories

1. As an author, I want to open a URL and find my talk's Space in the application, so that I can present it from any machine with a browser.
2. As an author, I want my talk's domain to open on the talk's Map with the talk Graph active, so that I can start presenting without navigating.
3. As an author, I want to present a mounted talk with the Stage, so that the audience sees exactly what they would see from a Running directory.
4. As an author, I want the Notes window to work against a mounted talk, so that I keep my notes and timer on the second screen.
5. As an author, I want to Enter a Space Resource in a mounted talk and Exit again, so that nested diagram Spaces work as they do locally.
6. As an author, I want every product URL of a mounted talk to load directly, including a Presenting URL at an Active Resource, so that I can bookmark or share a point in the talk.
7. As an author, I want refreshing the page mid-presentation to return to the same Resource, so that a stray reload does not cost me my place.
8. As an author, I want to deploy the talk by changing one pinned commit, so that what the audience sees changes only when I say so.
9. As an author, I want to mount any public repository holding an Aggregate directory by giving its location to the Hyper host, so that I can show a talk without building anything.
10. As an author, I want a mount of a branch to show which commit it is reading and to keep reading that commit across reloads and windows, so that the talk cannot change underneath me and I can share exactly what I see.
11. As an author, I want a mount of a subdirectory, so that a repository can keep its talk beside other material.
12. As an author, I want a mount that fails to say why, in the application's own failure surface, so that I can tell a missing repository or ref from a rate limit from an invalid aggregate.
13. As an author, I want a stored picture in my talk to show on the mounted site, so that Image Resources work as they do locally.
14. As an author, I want a mounted talk to say it is read-only, so that I am not surprised that I cannot edit it there.
15. As an author, I want no control on a mounted talk to offer an Edit, so that nothing appears to work and is then lost.
16. As an author, I want the application never to claim a mounted talk is persisted, so that its status never lies.
17. As an audience member, I want to open the talk's URL after the talk and step through it myself, so that I can revisit the material.
18. As an audience member, I want nothing I do on the site to change what the next visitor sees, so that the talk stays as its author left it.
19. As an audience member, I want the site to load fast and work on a phone, so that I can follow along from my seat.
20. As an audience member, I want a mistyped address within the talk to show the application's "not found" destination, so that I can find my way back.
21. As the owner of the site, I want it to cost nothing to host and have no server to keep up, so that a talk stays online indefinitely.
22. As the owner of the site, I want no request to the site able to write anything, so that there is nothing to vandalise.
23. As a Hyper developer, I want Mounting to reuse the HTTP application, the intake and the directory reader unchanged in what they decide, so that a mounted talk behaves exactly as a Running one.
24. As a Hyper developer, I want the directory reader's pure core separable from the filesystem, so that the browser can read an aggregate without pulling `node:fs` into the bundle.
25. As a Hyper developer, I want the static build to be one documented command, so that deploying it is short.
26. As a Hyper developer, I want Mounting tested at the browser startup seam and end to end, so that a regression in either the reader or the composition is caught.

## Implementation Decisions

- **One seam: the browser's `SpaceBackend`.** Mounting builds a `SpaceBackend` and the stored-image display for `createSpaceStartup`, which already takes both by injection. The backend is the existing `HttpSpaceBackend` given a `fetch` that dispatches to the Space HTTP application in the page, over a memory repository holding the mounted aggregate. Nothing behind the seam learns it is in a page. Implementing `SpaceBackend` directly over `MemorySpaceBackend` was rejected: it skips the whole-aggregate check, the working-space loader and the image store.
- **The mount module** exposes one operation: given the files of an Aggregate directory as a map from relative path to bytes, establish a fresh in-page store from them and return the backend and the image display for startup, or the reader's refusal. The GitHub source is a separate, small module that produces that map.
- **The directory reader splits into a pure core and a filesystem shell.** The core reads an aggregate from the path-to-bytes map, with no `node:` import, decoding text with `TextDecoder` and joining paths as strings. `readAggregateFiles`, which Export already uses to prove its output reads back, is the starting point. The shell walks the disk and feeds the core. Every module the browser reaches loses its `node:` imports, including `isDeepStrictEqual` in `aggregate-lifecycle.ts`.
- **A new browser-safe workspace package** holds the reader core, the aggregate lifecycle, the memory repository and the product resolution `src/http/space-host.ts` performs. Root `src/` keeps the filesystem shell and the CLI. The package gets a narrowed tsconfig `paths`, a lint zone, an alias in `tsconfig.base.json` and `vitest.config.ts`, and no `node:` import.
- **The GitHub source** is `github:owner/repo@ref/path`. The ref runs to the next `/`, so a slashed branch is addressed by its SHA or a tag. A ref that is not a 40-character SHA is resolved with one REST call. The tree of `path` at the SHA is listed in one REST call (`git/trees/<tree>?recursive=1`, where `<tree>` is `<sha>:<path>` for a subdirectory), only the paths Importing scans there are kept, and each blob is fetched from `raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>`, with bounded concurrency and one retry of a throttled blob. Only regular-file entries are read. It never uses a token. A rate limit, a missing repository or ref, a truncated tree and a refused aggregate are distinct failures. `fetch` is injected at composition (ADR 0109).
- **Mount addressing.** The location comes from the `source` query parameter, else from the build-time default, else the page asks for one. Product URLs do not change. The browser-location module carries `source` across every history write. Every successful mount writes its complete resolved GitHub location, with a commit SHA, into `source` using `history.replaceState`, including when the location came from the build-time default. The browser replaces the address only when it differs. A reload, a shared link and the Notes window then read the same commit even after a deployment changes the default; the bare domain opens the current deployment default.
- **Mounted Notes communication** is scoped by the resolved repository, directory, commit and Space ID. Two revisions of the same Space on the same origin cannot follow or control each other. Windows viewing the same resolved source and Space retain the existing presentation-following behavior.
- **Read-only is a session answer.** Authoring availability gains a mounted answer that withholds every Edit, including Open and Close, renames, deletes, creation, drags, connects and content editing. It keeps selection, navigation (Space, Map and Graph choice, Open Spaces, Enter, Exit) and Present. The existing `read-only` Map surface policy is not used for this, because `surfaceOffers` withholds Present under it (`packages/app/src/map-surface-policy.ts`) and `withSurfacePolicy` withholds every node gesture, which would leave Enter unreachable. The in-page HTTP application refuses every write rather than storing it.
- **Read-only is shown as its own mark** in the Command Dock. A mounted session never reports a persistence state.
- **The root resolves in the client.** On a server the host answers `/` with a redirect to the Meta Space. A mounted session resolves `/` to the Meta Space's address itself. A talk that should open on its slides makes the talk's Space the Meta Space. The PG Down Under directory is reshaped that way, with its diagram Spaces nested beneath it.
- **Stored images.** A mounted session resolves `/images/<content-id>` to an object URL over the fetched bytes, through one display resolver supplied at composition. On a server the resolver is the identity.
- **Static build.** A Hyper build target produces the static application, composed by a mount entry instead of the HTTP entry, with assets under content-hashed names. It reads an optional default GitHub location from a build-time variable. Workers static assets serve it with `not_found_handling: "single-page-application"`, so every product URL loads the application. An explicit Content Security Policy travels with the build as a Cloudflare `_headers` file under `/*`, since the HTTP host sends none to copy. It allows `connect-src` to `api.github.com` and `raw.githubusercontent.com`, and `img-src 'self' blob: data: https:`: `blob:` for stored images, and `https:` and `data:` because an Image Resource may show an external URL.
- **Deployment.** The Hyper repository deploys the static build to Cloudflare Workers static assets, with no `main`. `pgdu.tobyhede.com` is a custom domain on a deployment whose default location names the talk repository at a pinned commit.
- **Vocabulary.** CONTEXT.md gains **Mounting**. Mounting is neither Importing, because it establishes only an in-page store and never the stored aggregate, nor Running, because it writes nothing back. "Publishing" stays retired as a name for Exporting.
- **ADR 0130** records Mounting and its exceptions: the browser reads an aggregate, the in-page store is established through the lifecycle door ADR 0078 keeps off the browser seam, an unknown product URL is answered by the application rather than an HTTP 404, and ADR 0117's durability rule has no edit to apply to.

## Testing Decisions

- A good test drives Mounting through what an author or an audience member can observe: the Space and Resources drawn, presenting, the failure shown, and the absence of edit controls. It does not assert on the in-page store or the request routing.
- **Mount seam:** compose browser startup from a path-to-bytes map of the tracked fixture (`packages/app/fixture`) and assert the opened aggregate, a refused directory's diagnostics, and that every write is refused. Prior art: the startup and composition tests that call `composeCore`/`composeApp`, and the persistence session tests.
- **Directory reader core:** the existing aggregate-directory tests run against the pure core with an in-memory map as well as against the disk shell, so the two cannot diverge. A structural test holds that the new package imports nothing from `node:`. Prior art: Export's read-back check, and `test/unit/codemirror-encapsulation.test.ts` for an import guard.
- **Read-only availability:** the mounted answer offers Present, Enter, Exit and navigation, and offers no Edit. Prior art: the `authoring-availability` tests.
- **GitHub source:** tests over an injected `fetch` that answers the ref, tree and blob requests from the fixture. They cover ref resolution to a SHA, path scoping, a truncated tree, and rate-limit and not-found failures. A mixed-repository fixture includes unrelated files and a sibling aggregate: neither is fetched, and the selected aggregate mounts normally. A missing `hyper.json` at the selected path is refused rather than triggering a recursive search.
- **Mount addressing:** `source` survives every history write. Both explicit locations and build-time defaults become complete commit-pinned locations in the address, without a redundant history replacement. A copied URL still mounts its original commit after the deployment default changes. Mounted Notes tests show isolation between revisions sharing a Space ID, and normal following between windows of the same revision. Prior art: `packages/app/test/browser-location.test.ts`.
- **End to end:** a Playwright project serves the static build from a static file server with single-page fallback, its `fetch` to GitHub answered from the fixture by route interception. It checks that `/` reaches the Meta Space, that a Presenting URL loads directly and survives a reload, that a Space Resource is Entered and Exited, that the Notes window follows, that no edit control is offered, and that an unknown product URL shows the "not found" destination. Prior art: `packages/app/e2e/presenting.spec.ts`, `notes-window.spec.ts`, `read-only.spec.ts`, `space-routing.spec.ts`.

## Out of Scope

- An Aggregate pack, or any build step that copies a talk's files beside the application.
- Private repositories, tokens, and any Worker that proxies GitHub.
- Writing edits back to GitHub, or anywhere else, from a mounted session.
- Ephemeral in-tab Edits, Open and Close included.
- A shared, durable store behind a public host (Durable Objects, D1), and authentication for writes.
- Mapping hostnames to repositories on one host.
- Offline caching. If the venue network fails, `pnpm hyper run` on the author's machine is the fallback.

## Further Notes

- GitHub's REST API allows 60 unauthenticated requests an hour per IP and serves CORS. `raw.githubusercontent.com` serves CORS and cannot be listed. That limit does not govern it, but it throttles heavy use from one address with 429, which a room behind one NAT can reach. A commit-pinned load costs one API call, and a branch costs two.
