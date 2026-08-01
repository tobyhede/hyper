# 02 — Typed Hono SpaceBackend

**What to build:** Reimplement the browser HTTP adapter using Hono's typed
client over the exported `SpaceHttpApp` contract. Keep `SpaceBackend` as the
application-facing interface and retain runtime decoding, timeout and retry
semantics for every untrusted response.

**Blocked by:** 01 — the inferred route contract must exist.

**Status:** ready-for-agent

- [ ] Browser requests are constructed through `hc<SpaceHttpApp>` rather than
      duplicated path and method strings.
- [ ] The adapter still implements the existing `SpaceBackend` interface; no
      Hono type leaks into sessions, domain logic or UI callers.
- [ ] Existing runtime codecs validate list, load, conflict, commit and error
      responses after the typed client receives them.
- [ ] Request timeouts remain armed through response-body consumption.
- [ ] Network, timeout, unavailable, rate-limited, forbidden, not-found,
      invalid-snapshot and protocol outcomes retain their existing
      `CommitResult` meanings.
- [ ] A custom Fetch implementation remains injectable for tests and future
      host composition.
- [ ] Contract tests run against the Hono application and inject malformed
      responses to prove compile-time inference has not replaced runtime
      validation.
- [ ] The route type is imported without pulling server repository or runtime
      implementation into the browser bundle.
- [ ] Old duplicated URL construction and superseded HTTP client code are
      removed once consumers are migrated.
- [ ] `pnpm verify` passes.
