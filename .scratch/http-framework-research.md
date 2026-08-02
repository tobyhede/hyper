# HTTP framework decision

**Decision:** use Hono for Hyper's HTTP application.

Hyper prefers the broadest practical runtime surface, cross-runtime portability,
and a typed server/client contract. Hono is Fetch-native: route logic consumes
standard `Request`, `Response`, `Headers` and stream interfaces, with adapters
for Node.js and runtime-native hosting on platforms including Bun, Deno,
Cloudflare Workers, Fastly, Vercel and AWS Lambda.[^hono-web-standards]

Vite/Connect hosting and Node 24 were prototype wiring, not architectural
decisions. They did not select the HTTP framework. Express was recommended in
an earlier version of this note because it fits Vite's internal Connect host;
once that accidental constraint is removed, Express loses its decisive
advantage. Fastify is attractive for a deliberately Node-owned production
server, but choosing it now would make Node part of the architecture without a
product requirement for doing so.

## Requirements

- Preserve flexibility across runtimes and deployment surfaces.
- Keep the HTTP application independent of the server that happens to host it.
- Expose a typed client contract to the browser.
- Retain runtime validation at every untrusted boundary.
- Support ordinary operational concerns without forcing them into domain or
  repository interfaces.
- Do not let static-asset hosting determine the HTTP application model.

Whether one process serves both API resources and built assets is deployment
plumbing. A runtime adapter may serve both, a reverse proxy or CDN may serve the
assets, and development may proxy `/api` from Vite. None changes the Hono route
application.

## Why Hono

### Portable interface

Hono's application interface is the Web Fetch model rather than Node's
`IncomingMessage`/`ServerResponse` pair.[^hono-web-standards] Runtime-specific
code belongs at composition:

```text
                         ┌─ Node adapter
browser → Hono routes ───├─ Bun host
             │           ├─ Deno adapter
             │           └─ Worker/serverless host
             ▼
       SpaceRepository
             │
             └─ deployment-selected persistence adapter
```

The portable claim applies to the HTTP application. A concrete persistence
adapter may still constrain a deployment: for example, a database driver may
only support a subset of Hono's runtime targets. That is a composition fact, not
a reason to bind the route layer to that runtime.

### Typed client contract

Hono RPC exports the inferred application type and supplies `hc<AppType>` on the
client. Inputs validated by route validators and outputs returned by route
handlers are inferred by the client, including explicitly returned status
codes.[^hono-rpc] This is a material advantage over Express's request-handler
types.

The type contract is compile-time assistance, not trust. `decodeCommitRequest`,
the public Zod schemas and normal domain intake remain authoritative runtime
validation. Hono supports Standard Schema-compatible validators, including Zod,
for params, JSON, query values and headers.[^hono-validation]

Keep the exported application type browser-safe. The client should import it as
a type and must not pull repository, database or runtime-adapter implementations
into the browser graph. Hono documents compiling the client type separately for
larger monorepos to avoid repeated expensive type inference.[^hono-rpc]

### Small framework, explicit runtime adapters

Hono supplies routing, middleware composition, response construction, error and
not-found handling, request-body access, body-size middleware and direct
`Request`/`Response` testing.[^hono-app][^hono-body-limit][^hono-testing] The
runtime adapter owns socket and process behavior. For example, Node uses
`@hono/node-server`; another deployment selects its own supported host.

This separation is intentional. Graceful shutdown cannot be universally owned
by route code: a persistent server receives process or platform lifecycle
signals, while a serverless runtime owns instance shutdown itself.

## Operational capabilities

All serious framework candidates can advertise authentication, logging, rate
limiting, WebSockets and graceful shutdown. The useful distinction is which
parts remain portable.

| Concern | Portable Hono application | Runtime/deployment responsibility |
| --- | --- | --- |
| Authentication | Middleware can parse credentials, validate claims and attach identity. Hono includes common middleware such as bearer authentication.[^hono-auth] | Secret/key storage, identity provider integration and session storage. |
| Logging | Request context and structured events can be produced portably. | Output destination, correlation with platform logs and flushing guarantees. |
| Rate limiting | Policy and response behavior can remain middleware. | Shared counters, clocks and atomic storage depend on the deployment. |
| WebSockets | Hono exposes a common helper and typed RPC surface. | Upgrade and connection mechanics use adapters for Workers, Deno, Bun and Node.[^hono-websocket] |
| Graceful shutdown | Route code can honor abort signals and close application-owned resources. | Persistent-server lifecycle and serverless teardown are host-specific. |

These adapter points do not weaken the framework choice. They identify concerns
which are inherently not portable rather than pretending one server API can
make them so.

## HTTP body policy

The superseded prototype handler manually performed routing, JSON media checks,
buffering, UTF-8 decoding and response writing. That code contained concrete
protocol gaps:

- it discards a declared charset and then always decodes bytes as UTF-8;
- it ignores `Content-Encoding`, allowing compressed bytes to reach
  `JSON.parse` as a generic malformed request;
- it owns request drainage and keep-alive behavior directly.

Do not reproduce those helpers inside Hono route handlers.

This section originally recommended Hono's body-limit middleware to cap both
declared and streamed bodies, on the grounds that it checks `Content-Length` and
reads the stream when the length is absent or transfer encoding is
present.[^hono-body-limit] **That recommendation was rejected during
implementation and `bodyLimit` is deliberately not used.** Reading the header
first is the defect, not the feature: `bodyLimit` compares and returns without
consuming a byte, so an understated `Content-Length` smuggles any body through.
On overflow it also abandons a *locked* reader without draining the remainder,
which costs a keep-alive client its connection. `requireBoundedCommitBody` in
`packages/http/src/index.ts` counts the bytes that arrive, deletes the header
rather than consulting it, and drains the rejected body up to a bound. See the
`Content-Length` entry in `AGENTS.md` for the full reasoning.

Some behavior remains protocol policy rather than framework behavior:

- State explicitly which JSON charset Hyper accepts. Prefer one deliberate
  UTF-8 wire contract over silently accepting a charset and decoding it
  differently.
- State explicitly whether request `Content-Encoding` is supported. If it is
  not, reject non-identity encodings with 415 instead of treating compressed
  bytes as malformed JSON. If it is, implement it once as portable middleware
  where the required Web APIs exist, with adapter-specific coverage where they
  do not.
- Reconsider the canonical-decimal `Content-Length` rule independently. Hono's
  body limiter uses the parsed length for its cap; canonical spelling is a
  separate header policy.[^hono-body-limit-source] **Resolved:** the rule went
  with the raw handler. Nothing parses `Content-Length` any more, so how it is
  spelled cannot matter — counting the received bytes subsumes it.

Real host-level tests must remain for adapter behavior that Fetch-level tests
cannot prove: oversized chunked bodies, connection reuse, early rejection and
aborted requests. Hono's `app.request()` tests exercise the portable application
interface and complement rather than replace those adapter tests.[^hono-testing]

## Development and deployment

The intended relationship is:

```text
Current development
  browser → Vite frontend server
              ├─ /api → Hono Node adapter
              └─ other paths → Vite middleware

Deployment A
  browser → runtime host
              ├─ /api → Hono application
              └─ assets → built Vite output

Deployment B
  browser → CDN/static host
              └─ /api → separately deployed Hono application
```

Vite remains the current frontend build and development tool. `vite preview` is
for local build preview and is explicitly not a production server.[^vite-preview]
Its plugin is one concrete host composition and can be replaced without changing
the Hono route module or typed browser backend.

## Alternatives

### Express 5

Express is the idiomatic choice when embedding routes in an existing Connect
host. It also has mature request-body middleware. Neither is a governing
requirement: Connect ownership is inherited prototype wiring, and Express's
Node request/response interface narrows the deployment surface. Do not select it
merely because it produces the smallest diff from the current implementation.

### Fastify

Fastify has the strongest integrated Node-server facilities of the candidates:
body limits, content-type parsers, schema validation and serialization, hooks,
logging and injection tests.[^fastify-body][^fastify-validation] It becomes the
preferred alternative if Hyper deliberately decides to standardize on a
Node-owned server and values those operational facilities over cross-runtime
portability. That decision has not been made.

### Minimal routers

A router alone is insufficient. Route declarations are the easy part; a minimal
router leaves media types, charsets, content encodings, bounded reads and stream
cleanup in application code. That is precisely the boundary code this decision
is intended to remove.

## Consequences

- Hono becomes the stable HTTP application interface.
- Runtime hosts, database adapters and asset serving remain replaceable
  composition choices.
- The browser may use Hono's typed client, while public/runtime schemas continue
  to validate every value crossing the network.
- Runtime-specific WebSocket, shutdown, logging sink and rate-limit storage code
  stays outside portable route modules.
- The original Vite/Connect handler shape was migration input, not a
  compatibility constraint.
- Portability claims require contract tests across every supported adapter; an
  adapter is not supported merely because Hono publishes one.

[^hono-web-standards]: [Hono: Web Standards and supported runtimes](https://hono.dev/docs/concepts/web-standard)
[^hono-rpc]: [Hono RPC](https://hono.dev/docs/guides/rpc)
[^hono-validation]: [Hono validation](https://hono.dev/docs/guides/validation)
[^hono-app]: [Hono application interface](https://hono.dev/docs/api/hono)
[^hono-body-limit]: [Hono body-limit middleware](https://hono.dev/docs/middleware/builtin/body-limit)
[^hono-body-limit-source]: [Hono body-limit source (v4.12.33)](https://github.com/honojs/hono/blob/v4.12.33/src/middleware/body-limit/index.ts)
[^hono-testing]: [Hono testing with `app.request`](https://hono.dev/docs/guides/testing#request-and-response)
[^hono-auth]: [Hono bearer-auth middleware](https://hono.dev/docs/middleware/builtin/bearer-auth)
[^hono-websocket]: [Hono WebSocket helper and runtime adapters](https://hono.dev/docs/helpers/websocket)
[^vite-preview]: [Vite deployment guide: `vite preview` is not a production server](https://vite.dev/guide/static-deploy.html)
[^fastify-body]: [Fastify content-type parsing and body limits](https://fastify.dev/docs/latest/Reference/ContentTypeParser/)
[^fastify-validation]: [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
