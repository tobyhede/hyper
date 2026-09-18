# 03 — Memory runtimes and the E2E suite on the standalone host

**What to build:** `pnpm dev:new`, `pnpm dev:fixture` and `pnpm dev:roadmap` run their memory repositories behind the standalone host, and every `pnpm e2e` test starts its own host plus a Vite server forwarding to it.

**Blocked by:** 02 — `pnpm dev` over PostgreSQL through a standalone host.

**Status:** ready-for-agent

- [ ] Each memory command keeps its port, catalog and startup behaviour: `dev:new` creates the one-thing new space once, `dev:fixture` serves the tracked fixture, `dev:roadmap` serves the generated roadmap Space, and edits survive a browser reload for the host's lifetime.
- [ ] Every E2E test still owns a fresh host, memory repository and catalog; reloads and extra pages inside a test share them, and no revision leaks to another test.
- [ ] Host and Vite ports are worker-scoped and stay clear of 5173–5177 and the fixed restart-proof ports.
- [ ] A test's host and Vite server are both stopped at teardown, including when the test fails.
- [ ] The full `pnpm e2e` suite passes across its three shards, and its wall-clock is reported against the current run.
