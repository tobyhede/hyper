# 02 — Typed Hono SpaceBackend

**What to build:** Reimplement the browser HTTP adapter using Hono's typed
client over the exported `SpaceHttpApp` contract. Keep `SpaceBackend` as the
application-facing interface and retain runtime decoding, timeout and retry
semantics for every untrusted response.

**Blocked by:** 01 — the inferred route contract must exist.

**Status:** resolved

- [x] Browser requests are constructed through `hc<SpaceHttpApp>` rather than
      duplicated path and method strings.
- [x] The adapter still implements the existing `SpaceBackend` interface; no
      Hono type leaks into sessions, domain logic or UI callers.
- [x] Existing runtime codecs validate list, load, conflict, commit and error
      responses after the typed client receives them.
- [x] Request timeouts remain armed through response-body consumption.
- [x] Network, timeout, unavailable, rate-limited, forbidden, not-found,
      invalid-snapshot and protocol outcomes retain their existing
      `CommitResult` meanings.
- [x] A custom Fetch implementation remains injectable for tests and future
      host composition.
- [x] Contract tests run against the Hono application and inject malformed
      responses to prove compile-time inference has not replaced runtime
      validation.
- [x] The route type is imported without pulling server repository or runtime
      implementation into the browser bundle.
- [x] Old duplicated URL construction and superseded HTTP client code are
      removed once consumers are migrated.
- [x] `pnpm verify` passes.

## Answer

`HttpSpaceBackend` now belongs to the browser-safe `@project/http` package and
constructs all three resources through `hc<SpaceHttpApp>`. Its public surface
remains `SpaceBackend` plus Fetch and timeout configuration; Hono types do not
cross into sessions or application callers. The client keeps the timeout armed
until each response body is consumed and passes every untrusted list, load,
commit, conflict and error body through the existing runtime codecs.

The migration removed the hand-built persistence-package client and its
duplicated URL/method construction. Application and test composition now
supplies the HTTP application root, while the typed client owns
`/api/spaces`. The route validator separately exposes the JSON wire input to
Hono inference and returns its decoded domain value, so `expectedRevision` is a
typed decimal string on the wire and a `bigint` at the repository seam.

The public backend contract runs through a real in-process Hono application.
Injected Fetch responses prove malformed bodies, network failures, response
body stalls and every existing commit classification remain runtime-checked.
`pnpm verify` passes with 68 test files and 588 tests; the application production
build also succeeds. E2E was not run because neither runtime hosting nor UI
behaviour changed; the raw Node host remained the composition until ticket 03,
and ticket 04 then deleted it.
