# 06 — Retire the Vite-hosted API

**What to build:** Nothing loads the HTTP application inside Vite any more. The in-process plugin, its tests and its suppressions are deleted, and the agent documentation describes the standalone host.

**Blocked by:** 03 — Memory runtimes and the E2E suite on the standalone host; 04 — SQLite host and both restart proofs on the standalone host; 05 — Preview through the built standalone host.

**Status:** ready-for-agent

- [ ] No Vite configuration or E2E harness loads a runtime module in process; the plugin and the tests that exist only for it are gone, and their `eslint-suppressions.json` entries are pruned rather than hand-edited.
- [ ] `AGENTS.md`'s Commands section and the HTTP and build-tooling agent docs describe one host process per command, how to tell whether one is running, and that stopping it closes its database.
- [ ] `pnpm verify`, `pnpm e2e`, `pnpm e2e:ladle`, and in CI `e2e:postgres` and `e2e:sqlite`, pass on the finished state.
