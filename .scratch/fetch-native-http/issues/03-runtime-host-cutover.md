# 03 — Runtime host cutover

**What to build:** Compose the Hono application with the current PostgreSQL and
isolated E2E repositories, then host its Fetch interface through the selected
Node development/preview adapter. Keep the adapter at composition so Vite and
Node remain replaceable wiring rather than dependencies of `@project/http`.

**Blocked by:** 01 — the portable application must exist; 02 — the browser must
be able to consume its typed contract before final cutover.

**Status:** ready-for-agent

- [ ] Normal startup remains
      `PostgresSpaceRepository -> startup policy -> Hono application`.
- [ ] Every E2E host owns a fresh memory repository and catalog while reloads
      and pages inside that test share it.
- [ ] Non-API requests still reach Vite's SPA, HMR and static-asset handling;
      that fallthrough exists only in the Vite/Node adapter.
- [ ] The host uses Hono's maintained Node adapter rather than translating
      `IncomingMessage` and `ServerResponse` inside route code.
- [ ] Real-socket tests cover oversized chunked bodies, connection reuse after
      all rejection paths, aborted requests and non-API fallthrough.
- [ ] Development, `dev:memory`, `dev:new`, preview, standard E2E and the
      PostgreSQL opt-in E2E retain their documented repository selection.
- [ ] The human-owned development server is not restarted during the change;
      the handoff states that Vite config changes require restart.
- [ ] No deployment decision is inferred from this Node adapter, and asset
      colocation is not added to the portable interface.
- [ ] `pnpm verify` and `pnpm e2e` pass.
