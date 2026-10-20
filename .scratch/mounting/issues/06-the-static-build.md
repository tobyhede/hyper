# 06 — The static build

Status: ready-for-agent

**What to build:** one documented command that builds the static application for Mounting, and the end-to-end proof that it works (ADR 0130).

- A build target composes the application through a mount entry instead of the HTTP entry, with assets under content-hashed names. An optional build-time variable names the default GitHub location.
- A Cloudflare `_headers` file carries an explicit Content Security Policy under a `/*` rule, so every path the single-page fallback answers carries it. The HTTP host sends no application-wide policy to copy, so this one is written here: `default-src 'self'`, `connect-src 'self'` plus `api.github.com` and `raw.githubusercontent.com`, `img-src 'self' blob: data: https:` (an Image Resource may show an external URL), `object-src 'none'`, `base-uri 'self'` and `frame-ancestors 'none'`, with each directive's reason in this ticket's answer.
- The build is served with single-page fallback, so every product URL loads the application.
- A new Playwright project serves the build from a static file server with single-page fallback. It answers GitHub requests from `packages/app/fixture` by route interception, and serves the `_headers` policy on every response, so the suite runs under the real policy. It joins CI the way the existing projects do, and `AGENTS.md`'s Commands section names it.

**Depends on:** 03, 05.

**Acceptance:** the Playwright project shows that:

- `/` reaches the Meta Space.
- A Presenting URL loads directly and survives a reload.
- A Space Resource is Entered and Exited.
- The Notes window follows.
- No edit control is offered and the read-only mark shows.
- An unknown product URL shows the "not found" destination.
- A rate-limited GitHub answer shows its failure.
- A deep product URL's response carries the Content Security Policy.

The read-only mark is drawn only in a mounted session, so the PostgreSQL and SQLite restart proofs in `test/e2e/` see no change; grep `test/e2e/` anyway before calling a chrome change done (`AGENTS.md`, "Rules that bite").

Prior art: `packages/app/e2e/presenting.spec.ts`, `notes-window.spec.ts`, `read-only.spec.ts`, `space-routing.spec.ts`.
