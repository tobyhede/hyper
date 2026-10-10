# 02: Say which skills are vendored and which the repo owns

**What to build:** an agent or reviewer can tell from any doc that `.agents/skills/` holds four skills: `shadcn` is vendored and pinned by `skills-lock.json`, while `shadcn-first-ui`, `hyper-authoring` and `hyper-getting-started` are owned and reviewed here. The CodeRabbit config no longer marks the owned skills as vendored third-party content, so it reviews edits to them.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] AGENTS.md's "pinned by `skills-lock.json`" and the workflow guide's lock description and skill list name all four skills and pin only `shadcn`.
- [x] `.coderabbit.yaml` skips only the vendored skill as "do not suggest edits".
- [x] The `.gitignore` and `stryker.conf.mjs` comments name the current skills.
- [x] The `shadcn` lock hash is checked against the local version pins that `agent-skill-commands` enforces. Then either the hash is re-recorded, or the workflow guide says the skill is patched locally and how to re-apply the patch after an upstream update.

## Answer

AGENTS.md's Workflow pointer, the workflow guide's intro and its "Skills" section name all four skills and say only `shadcn` is vendored and pinned. `.coderabbit.yaml` now gives `shadcn` the "do not suggest edits" instruction alone and reviews the three owned skills as repository documents, keeping the security flags for all four. The `.gitignore` comment names the four, and `stryker.conf.mjs` names the four symlinks and the test that holds the mirror.

**The lock hash, checked 2026-10-10.** `skills-lock.json` hashes a skill as SHA-256 over its directory's files, sorted by relative path with `localeCompare`, feeding each path and then its bytes. That reproduces the recorded `e0594fe4…` exactly from the tree at `510a95cf3`, the commit that recorded it, which had already pinned every `shadcn@latest` to `shadcn@4.18.0`. The next commit to touch the skill, `369646d5b`, pinned `mcp.md`'s bare `shadcn` and added `registry.md`'s preview warning without re-recording, so the lock and the files disagreed (the current tree hashes to `f12537ba…`). The skill is patched locally, so both halves apply: the hash is re-recorded over the files as they stand, and the workflow guide's "The `shadcn` patch" says what the patch is, which parts `agent-skill-commands` holds, how to re-apply it after an upstream update, and how to recompute the hash.

Checks: `pnpm exec vitest run test/unit/agent-skill-commands.test.ts test/unit/agent-skill-symlinks.test.ts test/unit/current-domain-vocabulary.test.ts test/unit/docs-agents-citation-accuracy.test.ts` (119 passed), `pnpm exec prettier --check` on the changed files, `pnpm exec eslint stryker.conf.mjs`.
