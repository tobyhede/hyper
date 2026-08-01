# 01 — Portable Hono HTTP module

**What to build:** Add the browser-safe `@project/http` package and implement
the complete `/api/spaces` route tree as a Hono application over a narrow
`SpaceResourceRepository` interface. Preserve the established resource and
repository semantics while replacing hand-written routing, body buffering and
response construction inside the portable module.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The package exports `createSpaceHttpApp`, its inferred `SpaceHttpApp`
      type and the three-operation `SpaceResourceRepository` interface.
- [x] Existing PostgreSQL and E2E memory repositories satisfy the interface
      structurally; no pass-through repository adapter is added.
- [x] `GET /api/spaces`, `GET /api/spaces/:id` and
      `PUT /api/spaces/:id` preserve repository result mapping.
- [x] Hono validation and maintained media parsing replace the raw Node body
      reader and the hand-rolled `Content-Type` split. The RFC 9110 parameter
      scanner is kept, not replaced: `content-type@2` validates nothing — its
      `parse` has no throw path — so the scanner remains the whole of this
      package's media validation.
- [x] The 1 MiB cap counts the bytes that arrive and returns 413. It never
      trusts `Content-Length`: the header is deleted so `bodyLimit` streams, and
      an over-declared length is measured rather than believed.
- [x] Only absent/UTF-8 JSON charset and identity/absent `Content-Encoding` are
      accepted; unsupported values return 415.
- [x] Invalid JSON and path/body id mismatch return 400; invalid snapshots
      return 422; method rejection supplies the correct `Allow` header.
- [x] JSON responses are UTF-8, non-cacheable and do not expose repository
      failure details.
- [x] `app.request()` tests exercise every status and header through the public
      factory, including repository failures and malformed input.
- [x] Package dependency rules prevent Node, Vite, PostgreSQL, app, React and
      React Flow imports.
- [x] The old Node handler remains temporarily available only for cutover.
- [x] `pnpm verify` passes.

## Answer

Added the browser-safe `@project/http` workspace package. Its public
`createSpaceHttpApp` factory exposes the complete `/api/spaces` resource tree
through Hono's Fetch interface and exports the inferred `SpaceHttpApp` type plus
the three-operation `SpaceResourceRepository` seam. Compile-time tests prove
the existing PostgreSQL and E2E memory repositories satisfy that seam directly.

The application uses Hono validation and body limiting with maintained
`content-type` parsing. It enforces the 1 MiB cap on the bytes that arrive,
UTF-8 JSON and identity encoding policies, explicit method metadata, stable
repository result mappings, non-cacheable UTF-8 JSON responses and
non-revealing logged 503s. Twenty-six `app.request()` cases cover every response
status and required header without opening a socket. A compile-time Hono RPC
contract test proves that both a successful load and a commit conflict expose
the concrete `LoadedSpaceJson` wire shape rather than `unknown`; explicit 200
statuses keep that response distinct from the 409 branch during inference. The
old raw Node handler remains untouched for the later host cutover.

Final verification passed: `pnpm verify` ran 582 tests across 67 files; root and
all seven package typechecks, lint, formatting and coverage thresholds passed.
