# 06 — The static build

Status: ready-for-agent

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
