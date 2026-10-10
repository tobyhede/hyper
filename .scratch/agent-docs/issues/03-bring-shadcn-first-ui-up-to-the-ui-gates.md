# 03: Bring `shadcn-first-ui` up to the repo's current UI gates

**What to build:** an agent that follows `shadcn-first-ui` alone, on a new production component, passes `pnpm ui:catalog:check` and supplies the Ladle and application proofs ADR 0052 requires, without having to read AGENTS.md for the missing steps.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Step 1 names the catalogue that exists (`pnpm ladle`, the stable story sections including `space`) and the `ui` package's public exports. The "until the repository provides one" wording is gone.
- [x] The skill names the `ui` package as the design-system workspace and passes it to every shadcn CLI call.
- [x] The skill says how to add a registry item into the `ui` package (dry run, diff, add, export) and how to keep Hyper's recorded extensions.
- [x] The deviation rule includes the design-system inventory entry and the `styles.css` hand-rolled-block rule. "Done" includes `pnpm ui:catalog:check` passing.
- [x] Parity claims are named by their file. The story-evidence step names the Ladle Playwright config and the reminder to grep `test/e2e/` when the chrome changes.
- [x] The skill states that it, AGENTS.md and the UI guide override the vendored `shadcn` skill's generic recommendations, which include the deleted Sidebar, Sheet, Drawer and Tabs.
- [x] The `$prototype` reference and Codex-only syntax are removed. Each step has a "Done when".
