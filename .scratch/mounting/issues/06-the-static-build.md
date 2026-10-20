# 06 — The static build

Status: resolved

**What to build:** one documented command that builds the static application for Mounting, and the end-to-end proof that it works (ADR 0130).

- A build target composes the application through a mount entry instead of the HTTP entry, with assets under content-hashed names. An optional build-time variable names the default GitHub location.
- A Cloudflare `_headers` file carries a Content Security Policy equivalent to the one the HTTP host sends, plus `connect-src` for `api.github.com` and `raw.githubusercontent.com` and `img-src blob:`.
- The build is served with single-page fallback, so every product URL loads the application.
- A new Playwright project serves the build from a static file server with single-page fallback. It answers GitHub requests from `packages/app/fixture` by route interception. It joins CI the way the existing projects do, and `AGENTS.md`'s Commands section names it.

**Depends on:** 03, 05.

**Acceptance:** the Playwright project shows that:

- `/` reaches the Meta Space.
- A Presenting URL loads directly and survives a reload.
- A Space Resource is Entered and Exited.
- The Notes window follows.
- No edit control is offered and the read-only mark shows.
- An unknown product URL shows the "not found" destination.
- A rate-limited GitHub answer shows its failure.

Prior art: `packages/app/e2e/presenting.spec.ts`, `notes-window.spec.ts`, `read-only.spec.ts`, `space-routing.spec.ts`.

## Answer

- **The build.** `pnpm build:mount` (root script, delegating to `@project/app`'s) runs `vite build --config vite.mount.config.ts` in `packages/app` and writes `packages/app/dist-mount`: the same `index.html` as the HTTP build, its `/src/main.tsx` swapped for `/src/mount-main.tsx` by a `transformIndexHtml` plugin (so the startup view keeps one copy), assets under Vite's content-hashed `assets/` names, `public/` as is, and `_headers`. `dist-mount/` is ignored by version control, ESLint and Prettier.
- **The mount entry**, `packages/app/src/mount-main.tsx`, reads `resolveMountSource(sourceParameter(href), VITE_HYPER_DEFAULT_SOURCE)`, an empty variable counting as unset (typed in `src/mount-env.d.ts`). `ask` renders `GitHubLocationForm` with `navigate: window.location.assign` and the answer's failure; `mount` composes `createMountedStartup` with the page's `fetch`, `newUuid`, `URL.createObjectURL`, the browser fullscreen, `createBrowserPresentationLinks({ …, scope })` and the one `createBrowserHistory(window)`.
- **Unknown addresses.** A static host answers every path with the application, so a mounted startup first resolves a non-root path against the in-page store. One that is malformed, unresolved or outside product addressing opens the Meta Space with the address left as typed (`source` pinned) and the application's "Destination not found" report over it, through a new `BrowserLocation.reportArrivalNotFound()`; the reader's first move answers it, as a traversal's report is answered. A Notes address for a missing Space still fails startup.
- **`_headers`** (`packages/app/mount-headers.ts`, emitted by the build after Vite's HTML plugin) has one `/*` rule, so every path, a deep product URL answered by the single-page fallback included, carries the policy and `X-Content-Type-Options: nosniff`; `/assets/*` adds `Cache-Control: public, max-age=31536000, immutable`. The HTTP host sends no application-wide policy (only ADR 0107's stored-image responses discuss one), so there was no baseline to copy and this one is explicit:
  - `default-src 'self'`: everything the application loads is its own.
  - `script-src 'self' 'sha256-…'`: its bundle, and the hash of `index.html`'s one inline script (the startup-failure guard), computed from the page as built so it cannot drift.
  - `style-src 'self' 'unsafe-inline'`: needed; React Flow positions nodes and edges by inline `style`, and `index.html`'s startup view is styled inline.
  - `img-src 'self' blob: data: https:`: `blob:` for a stored image drawn from an object URL over mounted bytes; `https:` because an Image Resource may show an external URL (ADR 0106); `data:` for an authored data URL.
  - `font-src 'self'`: the build ships no web font.
  - `connect-src 'self' https://api.github.com https://raw.githubusercontent.com`: the GitHub source's two hosts; the in-page API never reaches the network.
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`: nothing embeds, rebases, posts elsewhere or frames the page.
- **The story.** `Components/GitHub Location Form` (`stories/components/github-location-form.stories.tsx`, `Asking`), claimed as `github-location-form-refuses-a-location-that-does-not-read`, with Ladle evidence in `ladle-e2e/github-location-form.spec.ts` and application evidence in the mount spec. Its `uncataloguedComponents` entry is gone; `mount-main.tsx` has one beside `main.tsx`.
- **End to end.** `pnpm e2e:mount` (`playwright.mount.config.ts`) builds into `packages/app/node_modules/.mount-e2e` with `VITE_HYPER_DEFAULT_SOURCE=github:tobyhede/talks@main`, serves it from `packages/app/e2e/static-server.ts` (port 5282, single-page fallback, applying the build's own `_headers`), and answers GitHub from `packages/app/fixture` through `context.route` over `test/fake-github.ts`, with GitHub's CORS headers. Every test fails on a Content Security Policy console violation in any page of its context. `packages/app/e2e/mount.spec.ts` covers `/` reaching the Meta Space with the default pinned to its commit; a deep product URL answered 200 under the policy; the read-only mark, no persistence status and no Edit; a Presenting URL loading directly and surviving a reload; Entering and Exiting a Space Resource; the Notes window opening at the pinned `source` and following; an unknown product URL and an outside path showing "Destination not found"; a rate-limited answer shown as the startup failure; and the ask form. `playwright.config.ts` ignores the spec. CI runs it as its own `mount` job beside `ladle`, gated by `CI passed`, and `test/unit/ci-container-image-pin.test.ts` counts its image pin and Node overlay. AGENTS.md Commands names `pnpm build:mount` and `pnpm e2e:mount`.
