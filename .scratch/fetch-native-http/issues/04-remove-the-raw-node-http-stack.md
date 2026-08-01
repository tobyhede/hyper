# 04 — Remove the raw Node HTTP stack

**What to build:** Complete the migration by deleting the superseded handler,
parser helpers, boolean fallthrough interface and build/plugin machinery that
exists only for that interface. Leave one documented Fetch-native application
and explicit runtime compositions.

**Blocked by:** 03 — every runtime must already serve the Hono application.

**Status:** ready-for-agent

- [ ] `src/http/space-http-handler.ts` and its private request parsing helpers
      are deleted.
- [ ] No `Promise<boolean>` HTTP handler or `.then(handled => next())` bridge
      remains.
- [ ] Obsolete Vite plugin, preview bundle aliases, scripts and tests are
      removed or rewritten around the selected Hono host adapter.
- [ ] The canonical `Content-Length` helper is removed unless a host-level test
      demonstrates behavior not already enforced by the runtime parser and
      Hono body limit.
- [ ] Documentation and AGENTS instructions describe the portable Hono module,
      typed client and current runtime adapters without presenting Node or Vite
      as architecture.
- [ ] A source scan finds no stale description of the raw Node handler as the
      intended persistence seam.
- [ ] `pnpm build` produces the browser and current runtime artifacts.
- [ ] `pnpm verify` and `pnpm e2e` pass.
