# 02 — Use RFC 9457 Problem Details on HTTP errors

**What to build:** Replace the prose-only HTTP error body with strict RFC 9457
Problem Details encoding and decoding while preserving the existing
`CommitResult` persistence interface.

**Blocked by:** 01 — Structure Space Authoring refusals.

**Status:** done

- [x] Define the closed Hyper problem types and strict browser-safe codecs.
- [x] Return `application/problem+json` for every non-conflict HTTP error with
  matching HTTP and body status, stable `type`, title and corrective detail.
- [x] Use typed extensions and RFC 6901 pointers only where they identify useful
  request content; never use prose or a pointer as the problem identity.
- [x] Decode Problem Details once in the HTTP adapter into the existing
  retryable/permanent `CommitResult` categories.
- [x] Keep the `409` conflict recovery representation carrying `LoadedSpace`.
- [x] Roll fixtures and tests forward without a `{ message }` compatibility path.
- [x] `pnpm verify` and `pnpm e2e` pass.
