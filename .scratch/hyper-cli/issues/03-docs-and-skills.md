# 03: Docs and skills name the one CLI

**What to build:** Every document and skill that names a command names the one CLI (see `../spec.md` and ADR 0124). The README quick start becomes `pnpm hyper init` then `pnpm hyper run`; "Developing Hyper" documents `import` and `export` with `--store` and `--dangerous-replace`.

**Blocked by:** 02 — `init` and `run`.

**Status:** ready-for-agent

- [x] `README.md`: quick start and "How Running works" use `init` and `run`, including that `run` refuses a missing or empty directory; "Developing Hyper" uses `import`/`export`/`--store`/`--dangerous-replace`
- [x] `AGENTS.md` Commands section: `pnpm start` and `pnpm hyper:sqlite` entries become the verbs; the rule that an agent may start and stop `run --no-open` on a directory of its own is kept
- [x] `docs/aggregate-directory.md` and `docs/agents/editing-and-persistence.md` name the verbs
- [x] `hyper-getting-started` creates the content directory with `init` and starts it with `run`; `hyper-authoring` names `run` in its stop-before-editing rule; each skill's changed steps were carried out once as written
- [x] `git grep -E "pnpm start|hyper:sqlite|dangerous-truncate"` outside `.scratch/`, `docs/adr/`, `docs/superpowers/` and migrations finds nothing
- [x] The agent-skill unit tests pass; `prettier --check` passes on the changed files
- [ ] The draft PR's `CI passed` is green
