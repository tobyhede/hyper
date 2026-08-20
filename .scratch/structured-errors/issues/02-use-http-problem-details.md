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

## Two defects a discarded first attempt already made

A working-tree draft of these codecs was reviewed and then reset away
(`packages/persistence/src/http-protocol.ts`), so the code is gone and the
mistakes are not. Both are round-trip failures the encoder and decoder can only
make together, which is why a property test over `encode` → `decode` is the
cheapest way to keep them out:

- [x] An empty `errors` array must not be encodable. The draft guarded on
  `errors === undefined`, so `encodeProblemDetails(code, detail, [])` emitted
  `errors: []`, which its own `decodeProblemErrors` rejected as "must be a
  non-empty array" — a caller that collected zero entries produced a response no
  client could read. Guard on `undefined` *or* empty, or make the parameter
  non-empty by construction.
- [x] The empty string is RFC 6901's whole-document pointer and must decode. The
  draft's `/^(?:\/(?:[^~]|~[01])*)+$/` requires at least one segment, so a
  problem error pointing at the request root was refused as malformed.

## Answer

The browser-safe persistence protocol now owns a closed Hyper Problem Details
catalogue and strict encoder/decoder. Every non-conflict HTTP error carries its
catalogued type, title, matching status and corrective detail under
`application/problem+json`; request-body attribution uses typed errors with RFC
6901 pointers only where the body contains something the caller can correct.

`HttpSpaceBackend` validates the media type, closed problem shape and agreement
between the HTTP and body statuses once, then translates the stable problem type
into the existing retryable or permanent `CommitResult`. The old `{ message }`
shape is a protocol failure, while `409` continues to decode the current
`LoadedSpace` recovery value.
