# 03 — Runtime host cutover

**What to build:** Compose the Hono application with the current PostgreSQL and
isolated E2E repositories, then host its Fetch interface through the selected
Node development/preview adapter. Keep the adapter at composition so Vite and
Node remain replaceable wiring rather than dependencies of `@project/http`.

**Blocked by:** 01 — the portable application must exist; 02 — the browser must
be able to consume its typed contract before final cutover.

**Status:** resolved

- [x] Normal startup remains
      `PostgresSpaceRepository -> startup policy -> Hono application`.
- [x] Every E2E host owns a fresh memory repository and catalog while reloads
      and pages inside that test share it.
- [x] Non-API requests still reach Vite's SPA, HMR and static-asset handling;
      that fallthrough exists only in the Vite/Node adapter.
- [x] The host uses Hono's maintained Node adapter rather than translating
      `IncomingMessage` and `ServerResponse` inside route code.
- [x] Real-socket tests cover oversized chunked bodies, connection reuse after
      all rejection paths, aborted requests and non-API fallthrough.
- [x] Development, `dev:memory`, `dev:new`, preview, standard E2E and the
      PostgreSQL opt-in E2E retain their documented repository selection.
- [x] The human-owned development server is not restarted during the change;
      the handoff states that Vite config changes require restart.
- [x] No deployment decision is inferred from this Node adapter, and asset
      colocation is not added to the portable interface.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Development, preview and browser-test composition now create a
`SpaceHttpApp` over the selected PostgreSQL or isolated memory repository.
Vite hosts that Fetch application through `@hono/node-server`'s maintained
request listener. The host selects `/api` requests and calls Connect's `next`
for every other path, so SPA fallback, HMR and static assets remain Vite's
responsibility without leaking Connect into `@project/http`.

The PostgreSQL runtime still applies normal database startup before exposing
the application. Each E2E runtime still constructs one fresh repository and
catalog, then shares it across the pages and reloads owned by that host. The
same development modes select PostgreSQL, the tracked fixture or an initially
empty catalog, and the preview build contains the same PostgreSQL composition.

Real Node socket tests exercise the installed Vite host interface rather than
Connect or Hono internals. They prove a chunked body over 1 MiB returns 413 and
drains before the same connection is reused; invalid identity, method, media
type, charset and content-encoding rejections also preserve that connection;
an aborted upload does not damage the host; and a non-API request reaches the
next Vite middleware. The Node adapter's documented global Request/Response
installation remains enabled because its lightweight Request is otherwise
incompatible with reconstructing a request to canonicalise accepted JSON media
headers.

`pnpm build` produced the PostgreSQL runtime and browser artifacts. `pnpm
verify` passed 608 tests across 69 files with every typecheck, lint, formatting
and coverage gate green; the final `pnpm e2e` run passed all 46 browser tests.
The Vite configuration changed, so a running development server needs a
human-initiated restart. Ticket 04 subsequently deleted the unused raw Node
handler, its legacy test server and the remaining obsolete compatibility tests.
