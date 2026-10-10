# 02: Say which skills are vendored and which the repo owns

**What to build:** an agent or reviewer can tell from any doc that `.agents/skills/` holds four skills: `shadcn` is vendored and pinned by `skills-lock.json`, while `shadcn-first-ui`, `hyper-authoring` and `hyper-getting-started` are owned and reviewed here. The CodeRabbit config no longer marks the owned skills as vendored third-party content, so it reviews edits to them.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] AGENTS.md's "pinned by `skills-lock.json`" and the workflow guide's lock description and skill list name all four skills and pin only `shadcn`.
- [ ] `.coderabbit.yaml` skips only the vendored skill as "do not suggest edits".
- [ ] The `.gitignore` and `stryker.conf.mjs` comments name the current skills.
- [ ] The `shadcn` lock hash is checked against the local version pins that `agent-skill-commands` enforces. Then either the hash is re-recorded, or the workflow guide says the skill is patched locally and how to re-apply the patch after an upstream update.
