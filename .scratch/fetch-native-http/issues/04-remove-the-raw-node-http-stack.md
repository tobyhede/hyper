# 04 — Remove the raw Node HTTP stack

**What to build:** Complete the migration by deleting the superseded handler,
parser helpers, boolean fallthrough interface and build/plugin machinery that
exists only for that interface. Leave one documented Fetch-native application
and explicit runtime compositions.

**Blocked by:** 03 — every runtime must already serve the Hono application.

**Status:** resolved

- [x] `src/http/space-http-handler.ts` and its private request parsing helpers
      are deleted.
- [x] No `Promise<boolean>` HTTP handler or `.then(handled => next())` bridge
      remains.
- [x] Obsolete Vite plugin, preview bundle aliases, scripts and tests are
      removed or rewritten around the selected Hono host adapter.
- [x] The canonical `Content-Length` helper is removed unless a host-level test
      demonstrates behavior not already enforced by the runtime parser and the
      application's own body bound. **Settled: remove the helper, and keep that
      bound.** `requireBoundedCommitBody` in `packages/http/src/index.ts` is the
      enforcement and stays, with its tests: it counts the bytes that arrive,
      deletes `Content-Length` before anything downstream is handed the request,
      and drains an oversized body within `MAX_DRAINED_BODY_BYTES` so the
      connection survives its 413. Hono's `bodyLimit` is **not** used — it
      trusts the declared length, and on overflow it abandons a locked reader
      that nothing can then drain. `space-http-app.test.ts` pins the
      understated, honest and over-declared cases and `vite-hono-host.test.ts`
      pins the connection reuse; none of that is in scope for deletion here.
      What goes is only `space-http-validation.ts`: the Hono application trusts
      no declared length, and Node's parser rejects negative and malformed
      lengths before dispatch, so nothing the helper caught reaches the
      application.
- [x] Documentation and AGENTS instructions describe the portable Hono module,
      typed client and current runtime adapters without presenting Node or Vite
      as architecture.
- [x] A source scan finds no stale description of the raw Node handler as the
      intended persistence seam.
- [x] `pnpm build` produces the browser and current runtime artifacts.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

The superseded `space-http-handler.ts`, its manual bounded reader, media check,
canonical `Content-Length` helper and `Promise<boolean>` interface are deleted.
The legacy boolean-aware test server and its support test are gone, as are the
duplicate raw-handler validation and backend contract suites. The workspace
startup test remains because it exercises user-visible composition; it now uses
`createSpaceHttpApp` and the typed `HttpSpaceBackend` through the Fetch seam.

The current `vite-space-http-plugin.ts`, preview SSR build and aliases,
`raw-http-request.ts`, and their tests remain deliberately. They are reached by
the selected ticket-03 Node/Vite composition: the plugin adapts Hono through
`@hono/node-server`, the preview build emits the PostgreSQL runtime, and the raw
request helper proves socket behavior that Fetch-level tests cannot observe.
None contains the deleted boolean bridge.

A source scan finds no `createSpaceHttpHandler` or `SpaceHttpHandler` in live
source or tests and no HTTP `Promise<boolean>` or handled-to-`next` bridge. Raw
Node wording remains only where it records the superseded implementation: the
ADR/spec migration consequence, resolved staged tickets, this ticket, the Hono
research history, and the old persistence implementation plan and issue. The
old plan now carries an explicit historical/superseded banner, and the old issue
points to ADR 0034 before its original Answer.

TDD began with a failing architectural source check for the legacy route module,
then migrated the surviving startup behavior and let typecheck identify the
remaining obsolete consumers. Focused coverage passed 65 tests across the Hono
application, typed backend, startup, runtime selection, Vite plugin, real Node
host and preview build configuration. `pnpm build` emitted
`dist-http/postgres-http-runtime.js` and the browser bundle. `pnpm verify` passed
67 files and 592 tests with all typecheck, lint, format and coverage gates green;
`pnpm e2e` passed all 46 browser tests. Ticket 04 did not change Vite
configuration, so it adds no restart requirement beyond ticket 03's stacked
configuration change.

## Review follow-up

A second review found one contract defect and three gaps the suite could not
have caught. Each fix was driven from a failing test, and each test was checked
against the production change it exists to catch.

`HEAD /api/spaces/<non-uuid>` answered 405 `Allow: GET, PUT` while GET and PUT
answered 400, so it advertised methods for a resource no request can address.
The HEAD guard matched the resource shape without reading the identity, and it
duplicated `app.notFound()`'s judgement rather than sharing it. Both now call
one `unservedContractPath`. Deleting the guard instead is not an option, and the
test says why: Hono answers HEAD from the GET handler and strips the body, so
the resource would return 200 carrying nothing.

The Node adapter's global `Request`/`Response` installation was load-bearing and
recorded only in ticket 03's prose. `requireSupportedRequestMedia` and
`requireBoundedCommitBody` rebuild the request through the *global* `Request`
constructor, so `overrideGlobalObjects: false` makes every commit answer 500
while every rejection path stays green. No test reached the accepted media path
over a socket, because the host suite's repository rejected every commit. One
now does, using an RFC 9110-legal `application/json ; charset=utf-8` that only
the rewrite can serve; with the override disabled it fails 500, as does the
oversized-body test. AGENTS.md carries both host facts.

`configurePreviewServer` had lost its only dispatch test when the host moved to
the Node adapter — it asserted the module path and never drove a request — so
the branch serving the built PostgreSQL runtime was unproven. It is now driven
over a socket like development; wiring it to the wrong module or dropping its
registration both fail it.

`packages/http/src/**` had no coverage threshold, which is how the media scanner
shipped at 69.89% statements unnoticed. It is now gated at 98/94/96, verified to
fail the run when raised above what holds. `@hono/node-server` moved to
`devDependencies`: only the Vite host plugin imports it, and no browser or built
runtime artifact contains it.

`pnpm verify` passed 68 files and 649 tests, `pnpm build` emitted both artifacts
and `pnpm e2e` passed all 60 browser tests.
