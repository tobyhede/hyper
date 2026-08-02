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
      demonstrates behavior not already enforced by the runtime parser and the
      application's own body bound. **Settled: remove the helper, and keep that
      bound.** `requireBoundedCommitBody` in `packages/http/src/index.ts` is the
      enforcement and stays, with its tests: it counts the bytes that arrive,
      deletes `Content-Length` before anything downstream is handed the request,
      and drains an oversized body within `MAX_DRAINED_BODY_BYTES` so the
      connection survives its 413. Hono's `bodyLimit` is **not** used — it
      trusts the declared length, and on overflow it abandons a locked reader
      that nothing can then drain. `space-http-app.test.ts` pins the
      understated, honest and over-declared cases and `vite-hono-host.test.ts`
      pins the connection reuse; none of that is in scope for deletion here.
      What goes is only `space-http-validation.ts`: the Hono application trusts
      no declared length, and Node's parser rejects negative and malformed
      lengths before dispatch, so nothing the helper caught reaches the
      application.
- [ ] Documentation and AGENTS instructions describe the portable Hono module,
      typed client and current runtime adapters without presenting Node or Vite
      as architecture.
- [ ] A source scan finds no stale description of the raw Node handler as the
      intended persistence seam.
- [ ] `pnpm build` produces the browser and current runtime artifacts.
- [ ] `pnpm verify` and `pnpm e2e` pass.
