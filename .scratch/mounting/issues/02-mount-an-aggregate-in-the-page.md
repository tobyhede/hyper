# 02 — Mount an aggregate in the page

Status: resolved

**What to build:** the mount module, and a composition of browser startup that uses it (ADR 0130).

- One operation: given an Aggregate directory's files as a path-to-bytes map, read them with 01's core, establish a fresh memory repository from them through the aggregate lifecycle, and return either the reader's refusal or what `createSpaceStartup` takes: a `SpaceBackend` and a stored-image display.
- The backend is the existing `HttpSpaceBackend` given a `fetch` that dispatches to `createSpaceHttpApp` in the page, over that repository. The same intake, commit decision, working-space loader and destination resolution answer every request.
- `/` resolves in the client to the Meta Space's address, as the Space host's redirect does on a server.
- A stored image's `/images/<content-id>` resolves to an object URL over the mounted bytes, through one display resolver supplied at composition. On the server composition the resolver is the identity.
- A refusal is shown on the application's own failure surface with the reader's diagnostics.

**Depends on:** 01.

**Acceptance:**

- A test composes startup from a path-to-bytes map of `packages/app/fixture` and sees the Meta Space opened with its Resources.
- A broken map shows Import's diagnostics.
- A stored image draws from an object URL.
- Prior art: the startup and composition tests that call `composeCore`/`composeApp`.

## Answer

Built in `packages/app/src/mount/`, with no `node:` import.

- `mount.ts`: `mountAggregate({ name, files, newId, createObjectUrl })` reads the files with `readAggregateFiles`, stores the images and then `initializeAggregate`s a fresh `MemorySpaceRepository`, and answers `{ ok: true, mounted: { metaSpaceId, backend, displayImage } }` or `{ ok: false, refusal: { kind: 'unreadable' | 'aggregate-refused', diagnostics } }`. `backend` is an `HttpSpaceBackend` whose `fetch` dispatches each request to `createSpaceHost` over that repository with `host.fetch(new Request(...))`. `describeMountRefusal` (now `describeAggregateReadRefusal` in `@project/aggregate`, shared with `pnpm hyper run`) words a refusal as `pnpm hyper run` does, and the aggregate-refused lines are `describeAggregateRefusal`, which moved from `src/cli/` into `@project/aggregate` so the CLI and the mount share it.
- Writes (03's bullet): the in-page fetch answers every method but `GET` and `HEAD` with the existing `forbidden` Problem Details (403) before the host sees it, so a commit is `permanent-failure`/`forbidden` and an image upload throws, and nothing is stored. It is refused there rather than in the repository because the working-space loader's first-load write for a mapless Space (ADR 0079) must still land in the page.
- `mounted-startup.ts`: `createMountedStartup({ ...mount, fullscreen, presentations, history })` mounts once on the first resolve, throws a refusal's sentence so `StartupFailure` shows it, and composes `createSpaceStartup` over the mounted backend. `/` resolves in the client: the address is replaced with the Meta Space's and that is opened. A future `mount-main.tsx` calls it with `URL.createObjectURL` and the page's adapters; no build target was added.
- Images: `ImageDisplay` (`packages/ui/src/image-display.ts`) is one resolver from an Image Resource's URL to where it is drawn from, read by `ResourceImage` through `ImageDisplayProvider`. `createSpaceStartup` takes it as its last seam, defaulting to `displayImageAsAuthored` (the identity), and puts it on the startup result, which `startApplication` provides around both the Space and the Notes window. The mount's resolver makes an object URL over a stored image's bytes the first time it is drawn.

Tests: `packages/app/test/mount.test.tsx` — the fixture opens at `/` on the Meta Space with its Resources and moves the address there; a directory without `hyper.json` and an aggregate naming a missing Meta Space each show their diagnostics on the startup failure; a commit and an image upload are refused and the Space's revision and title are unchanged; and Deep dive's Harbour image draws from the injected object URL over the fixture's PNG bytes.
