# 06 — Space-file writer (`space.local.json`)

Status: resolved
Type: task
Blocked by: 05

Makes an arrangement survive a reload. Dev-only, localhost-only, deliberately the
smallest thing that writes a real file — Vite is already the server, so there is
no new process, no picker, and no permission prompt.

**Write only ever touches `space.local.json`. Read prefers it, falls back to
`space.json`. e2e forces the base.**

In `packages/app/vite.config.ts`, one plugin with `apply: 'serve'` so it cannot
exist in a build:

- A **virtual module** (`virtual:space-file`) whose `load()` reads
  `fixture/space.local.json` when present and `SPACE_BASE_ONLY` is unset, else
  `fixture/space.json`. Resolving in `load()` rather than at config time means
  creating the local file for the first time needs no dev-server restart — which
  matters, because the human owns that server and it is not ours to bounce.
  `space.ts` then does `import spaceFile from 'virtual:space-file'` and stays
  synchronous: everything downstream, including the module-scope
  `createPresentationStore(space)` binding, is untouched. (Fetching the space
  file instead would make loading async and force that binding to become
  stateful — a real refactor for no gain.)
- A **middleware** on `/__space`: `PUT` → `spaceFileSchema.safeParse` → write
  `space.local.json`. Validate server-side so a client bug cannot corrupt
  authored content. The target path is fixed in the config and never sent by the
  client — an endpoint taking a path from the browser is an arbitrary-file-write
  primitive for any page you have open.
- **No `addWatchFile`**, no HMR invalidation. The app writes this file after every
  drag; a self-triggered remount mid-interaction is the same class of feedback
  loop the spike spent two rounds killing. The saved arrangement is picked up on
  the next full page load, which is all it needs to do.

**Inherited from 05: the created Layout's identity.** A Layout created on open
(ADR 0017) has no id and the space names no `defaultView`, so serializing one
means deciding both. Whatever it is called, the written space file must open in
it — an arrangement that does not reopen is the derived-placement failure wearing
a different hat. 05 was originally to do this and could not: it now happens at
creation rather than at Auto-arrange, and only serialization makes the answer
observable.

That is a **short authored-style id**, the same kind a card or route has — minted
here because no author was present to type one. No uuid, no second field (ADR
0016, rejected).

Serialize from the **space file**, not from the `Space` — the `Space` is indexed
and derived, so reconstructing a file from it means un-deriving. Keep the parsed
space-file value alongside it in `space.ts` and write `{ ...spaceFile, layouts,
defaultView }`.

`.gitignore` gets `packages/app/fixture/space.local.json`. Deleting the file is
how you throw away an arrangement.

`playwright.config.ts` sets `SPACE_BASE_ONLY` in `webServer.env`. Without it a
stale local file left from manual play silently makes e2e test a different graph
— a failure that reads as a code regression and is not.

## Acceptance

- Drag, reload, the card is where you left it; delete `space.local.json`, reload,
  the fixture is back.
- The written file passes `spaceFileSchema` and re-parses through `loadSpace`.
- `pnpm e2e` green with a `space.local.json` present on disk — the guard proving
  the env override works.
- `pnpm verify` green.

## Answer

`packages/app/vite-space-file-plugin.ts`, wired into the app's Vite config.
`virtual:space-file` prefers `fixture/space.local.json` and falls back to
`space.json`, resolved in `load()` so creating the local file needs no restart.
`PUT /__space` validates with `spaceFileSchema` server-side and writes the fixed
path; the client never sends a path.

`packages/app/src/persist.ts` serializes from the space *file* kept beside the
Space in `space.ts`, never from the derived Space. The created Layout takes the
minted short id `layout` and the file names it as `defaultView`, so a reload
reopens in the arrangement instead of recomputing one.

Saving is driven by a `revision` counter in the editor store: it ticks on a
settled drag and on arrange, and **not** on the creation sync, so opening a space
never writes. A settled change that moved nothing does not tick it either.

Two corrections to the ticket, both discovered by the dev server refusing to
start:

**`apply: 'serve'` was wrong.** The ticket asked for it so the plugin "cannot
exist in a build", but `space.ts` imports the virtual module unconditionally, so
a build could not resolve it and `pnpm build` failed. Reading has to work in a
build; only *saving* is dev-only, and saving lives in `configureServer`, a hook
Vite calls only for the dev server — so the endpoint cannot exist in a build
however the plugin is applied. A build always reads the authored base, since
baking one machine's arrangement into a bundle would ship working state as
content.

**A workspace package cannot be imported into the config by name.** Vite loads
`vite.config.ts` in Node and externalizes bare specifiers, so `@project/core`
handed Node the TypeScript source, whose extensionless relative imports Node's
ESM resolver rejects — the config failed to load at all. A relative import is
bundled by esbuild, which resolves them.

Unrelated to this ticket but surfaced by it: the gitignored spike harness broke
`pnpm dev`. It had gone stale against the `elkLayout` → `elkStrategy` rename, and
Vite's dependency scanner reads every root `.html` without consulting
`.gitignore`. Deleted rather than excluded (2ee3638) — ignoring a thing is not
being rid of it, and tsc/eslint skipping `.scratch/` is why `pnpm verify` never
noticed.

Verified against a real dev server on a spare port, since the acceptance is about
files on disk: the virtual module loads; a valid PUT returns 204 and writes; a
**fresh server reads the arrangement back** (`defaultView=layout`); malformed and
non-JSON bodies are rejected 400; `SPACE_BASE_ONLY` both hides an on-disk local
file and makes the write a no-op. Every temporary file was removed, and no local
file existed beforehand.

`pnpm verify` green — 159 tests (6 new). `pnpm e2e` green — 19. `pnpm build`
green.
