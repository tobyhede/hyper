# Fetch-native HTTP application

Status: ready-for-agent

Decision: ADR 0034 — The HTTP application is Fetch-native.

Research: `.scratch/http-framework-research.md`.

## Problem Statement

Hyper's browser persistence resources are currently implemented as a raw Node
handler. That handler performs routing, response construction, request
buffering, size enforcement, media-type recognition, UTF-8 decoding and stream
drainage itself. Its `Promise<boolean>` return exists only to fall through to
Vite's Connect middleware.

The implementation has already accumulated protocol gaps. It accepts a JSON
media type with any declared charset and then decodes the bytes as UTF-8, and it
does not define a policy for `Content-Encoding`. More importantly, the shape
turns accidental prototype choices — Node 24 and a Vite-owned server — into
constraints on a module that should be portable.

Hyper wants the broadest practical runtime surface, cross-runtime portability
and a typed server/client contract. Whether one process serves application
resources and static assets is deployment composition and must not select the
HTTP framework.

## Solution

Introduce a browser-safe `@project/http` package containing a Hono application
and the browser's HTTP implementation of `SpaceBackend`. Its route module uses
standard `Request`, `Response`, `Headers` and stream interfaces. It imports no
Node, Vite, PostgreSQL or process-lifecycle modules.

The package exports `createSpaceHttpApp(repository, options)` and the inferred
`SpaceHttpApp` route type. The factory accepts a narrow
`SpaceResourceRepository` interface containing only `listSpaces`, `loadSpace`
and `commitSpace`. The existing PostgreSQL and E2E memory repositories both
satisfy this real seam; import, export and truncation do not leak into the HTTP
module.

The package also supplies the HTTP adapter implementing the existing
`SpaceBackend` interface. It constructs Hono's typed client from
`SpaceHttpApp`, but continues to decode response bodies through the existing
runtime codecs. The inferred type catches client/server drift during
compilation; it does not turn network input into trusted data.

Runtime composition creates a repository, applies startup policy, creates the
Hono application and passes `app.fetch` to a host adapter. The migration may
retain Vite hosting as one development adapter, or proxy to a separate local
host, but no portable module knows which was chosen. Static assets may share a
host or be served separately.

```text
browser
   │
   ▼
typed SpaceBackend adapter ──► Hono route module ──► SpaceResourceRepository
                                  │                         │
                            Fetch interface          deployment adapter
                                  │                         │
                     ┌────────────┼────────────┐      Postgres / memory
                     ▼            ▼            ▼
                   Node         Worker       other host
```

## HTTP Contract

The existing resources remain fixed:

- `GET /api/spaces` lists Space summaries.
- `GET /api/spaces/:id` loads one Space or returns 404.
- `PUT /api/spaces/:id` commits one complete snapshot at an expected revision.
- Non-API paths are not part of the Hono application contract.

The migration deliberately defines the request policy rather than inheriting
parser accidents:

- JSON request bodies are capped at 1 MiB, counted as they arrive. A declared
  `Content-Length` is never trusted, in either direction: an understated one
  cannot smuggle a larger body past the count, and an over-declared one is
  measured rather than rejected on the header.
- `application/json` with no charset or an explicit UTF-8 charset is accepted.
- Any other charset is rejected with 415 before JSON validation.
- Compressed request bodies are not an MVP capability. A non-identity
  `Content-Encoding` is rejected with 415 rather than surfacing as malformed
  JSON.
- A body over the cap returns 413, and the rest of that body is read and
  discarded so the 413 leaves a persistent connection reusable. The drain is
  bounded: past its allowance the body is left unconsumed and the host drops the
  connection, which is the right answer for a client that will not stop sending.
- Invalid JSON or a path/body id mismatch returns 400. A valid but inadmissible
  Space snapshot returns 422. Error messages are prose; a schema failure is
  summarised rather than serialized into the `message` field.
- Method rejection retains an accurate `Allow` header.
- Responses remain JSON, UTF-8, and `Cache-Control: no-store`.
- Repository failures are logged through an injected logger and return the
  existing non-revealing 503 response.

Canonical spelling of `Content-Length` is not part of the portable application
contract. A runtime HTTP parser may reject malformed or conflicting lengths
before Hono receives a `Request`. Host-level tests cover that behavior where it
matters.

## Module Design

`@project/http` is one deep transport module. Callers learn one application
factory and one `SpaceBackend` implementation; routing, validation, wire
encoding, error mapping and Hono client construction remain inside.

The package depends on `@project/core`, `@project/persistence` and Hono.
`@project/persistence` remains framework-independent and browser-safe. The app
composition package may depend on `@project/http`; lower domain, graph, UI and
React Flow packages may not.

Do not introduce a generic `RuntimeAdapter` interface in anticipation of future
hosts. Each selected host uses Hono's concrete adapter at composition. The
portable Fetch interface is the stable seam; a custom adapter abstraction would
only mirror Hono.

The inferred route type must remain cheap and safe for the browser to import.
If TypeScript inference becomes materially slow, emit the route declaration as
a build artifact rather than moving runtime implementation into the browser
dependency graph.

## Testing Decisions

- Portable route contract tests use `app.request()` and cover every resource,
  status, header and response codec without opening a socket.
- Browser adapter contract tests run the existing `SpaceBackend` suite against
  Hono's typed client and still inject malformed responses to prove runtime
  decoding remains authoritative.
- At least one real Node host test covers chunked oversize bodies, connection
  reuse after rejection, aborted requests and non-API fallthrough where the
  selected development adapter supports it.
- Standard Playwright remains database-free and crosses real HTTP through an
  isolated memory repository. The PostgreSQL opt-in test continues proving
  durability through a fresh host.
- Package rules and typechecks prove that `@project/http` contains no Node,
  Vite, PostgreSQL or application imports.
- Each runtime adapter receives its own contract suite before Hyper claims that
  runtime as supported.

## Migration

1. Land the portable Hono package and prove protocol parity through its Fetch
   interface while the current Node handler still serves the application.
2. Move `HttpSpaceBackend` behind the typed Hono client without weakening
   runtime response validation or timeout behavior.
3. Replace the raw Node/Vite handler composition with a concrete host adapter,
   preserving development, preview and isolated E2E behavior.
4. Delete the old parser, boolean fallthrough interface and obsolete build or
   plugin wiring once all callers use the Hono module.

## Out of Scope

- Selecting a permanent production runtime or cloud platform.
- Requiring application resources and static assets to share a process.
- Claiming support for a runtime that has no Hyper adapter contract suite.
- Adding authentication, rate limiting, WebSockets or new logging backends.
  The design leaves their portable policy and runtime facilities composable;
  this migration does not invent requirements for them.
- Changing `SpaceBackend`, `SpaceSession`, repository commit semantics or the
  `/api/spaces` resource model.
- Supporting compressed request bodies or non-UTF-8 JSON.
