# 08: Open AGENTS.md with the rules that bite, and remove the remaining lineage

**What to build:** an agent reading the top of AGENTS.md meets the rules most often broken before any of the long entries. Those rules are:
- start production UI work with `shadcn-first-ui`;
- never start or kill a dev server;
- mint ids through the injected `newId`, never by mocking `crypto`;
- use extensionless relative imports, and `import type` for type-only imports;
- the suppressions file only shrinks;
- Vite configs import `@project/*` by relative path;
- grep `test/e2e/` when the chrome changes.

The rest of the file carries no lineage, and the refusal-cascade guide is listed under "Agent skills".

**Blocked by:** 05, 06, 07.

**Status:** ready-for-agent

- [ ] A short rules block sits at the top of AGENTS.md. Each rule links to where it is explained.
- [ ] No "is gone", "went", "used to" or "before this" phrasing remains in AGENTS.md, unless it states a present constraint.
- [ ] AGENTS.md is measurably smaller than its 68 KB at the time of the audit, against a target recorded in this ticket when work starts.
