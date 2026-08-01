# 01 — Portable Hono HTTP module

**What to build:** Add the browser-safe `@project/http` package and implement
the complete `/api/spaces` route tree as a Hono application over a narrow
`SpaceResourceRepository` interface. Preserve the established resource and
repository semantics while replacing hand-written routing, body buffering and
response construction inside the portable module.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The package exports `createSpaceHttpApp`, its inferred `SpaceHttpApp`
      type and the three-operation `SpaceResourceRepository` interface.
- [ ] Existing PostgreSQL and E2E memory repositories satisfy the interface
      structurally; no pass-through repository adapter is added.
- [ ] `GET /api/spaces`, `GET /api/spaces/:id` and
      `PUT /api/spaces/:id` preserve repository result mapping.
- [ ] Hono validation and maintained media parsing replace the raw Node body
      reader and the hand-rolled `Content-Type` split.
- [ ] The 1 MiB cap covers declared and streamed bodies and returns 413.
- [ ] Only absent/UTF-8 JSON charset and identity/absent `Content-Encoding` are
      accepted; unsupported values return 415.
- [ ] Invalid JSON and path/body id mismatch return 400; invalid snapshots
      return 422; method rejection supplies the correct `Allow` header.
- [ ] JSON responses are UTF-8, non-cacheable and do not expose repository
      failure details.
- [ ] `app.request()` tests exercise every status and header through the public
      factory, including repository failures and malformed input.
- [ ] Package dependency rules prevent Node, Vite, PostgreSQL, app, React and
      React Flow imports.
- [ ] The old Node handler remains temporarily available only for cutover.
- [ ] `pnpm verify` passes.
