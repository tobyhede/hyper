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

**Status:** resolved

**Size baseline and target (recorded 2026-10-10, before this ticket's work):** AGENTS.md was 68,871 bytes at the audit and 40,930 bytes after tickets 05–07. Target: at most 45,000 bytes (a third smaller than the audit's 68,871), measured with `wc -c AGENTS.md`.

- [x] A short rules block sits at the top of AGENTS.md. Each rule links to where it is explained.
- [x] No "is gone", "went", "used to" or "before this" phrasing remains in AGENTS.md, unless it states a present constraint.
- [x] AGENTS.md is measurably smaller than its 68 KB at the time of the audit, against a target recorded in this ticket when work starts.

## Answer

**Size:** 68,871 bytes at the audit (this branch at `fb0397b6`; `main` holds 68,616), 40,930 after tickets 05–07, **33,440 bytes** now (`wc -c AGENTS.md`, after the review fixes), against the recorded target of at most 45,000: 51% smaller than the audit.

**Rules block.** "Rules that bite" follows the one-paragraph summary, before any long entry. Each rule links to its explanation: `shadcn-first-ui` to the skill and `ui.md`; dev servers to Commands, "Dev"; `newId` to `anti-slop.md`'s new section; extensionless relative imports and `import type` to Conventions; the suppressions file to `anti-slop.md`, "The suppressions baseline"; Vite configs to `build-tooling.md`; `test/e2e/` to Commands, "E2E". The "only source of state" paragraph has its own heading after it.

**Moved, so each rule has one home:**

- ADR 0109's injected-nondeterminism rule, with the `randomUUID` reasons → `anti-slop.md`, "Nondeterminism is injected at composition, never mocked (ADR 0109)". The miscounting-spy story is kept as the hazard it shows, not as history.
- `path`, "arrangement", and the three vocabulary-guard bullets ("workspace", the retired Space name, the two blind spots) → `domain.md`, beside "Use the glossary's vocabulary" and in a new "The vocabulary guard" section, without "issue 08/11", "until now" or the reviewer story.
- The two comment-rule bullets → one Conventions line pointing at `workflow.md`, which already states all four claim rules and the lineage rule.
- The `eslint-suppressions.json` bullet → the rules block; `anti-slop.md` already stated all of it.
- The Vite relative-path hard rule keeps its line (ESLint's message cites AGENTS.md for it) and points at `build-tooling.md` for the reason.

**Lineage removed from AGENTS.md:** "Before this, `core` could import…", "all four are now enforced", "left with ADR 0086 … the two that survive", "`importSpaces` … that used to sit there is gone" (restated as the ADR 0078 constraint), "only notification moved", "the third copy that used to sit in `vite.config.ts` is gone", "the sentence here used to contrast…", "it now holds both proofs". The remaining match for the lineage words is "retired words", a present-tense fact.

**Agent skills** now lists "Authoring refusal cascade" and widens the Anti-slop and Domain docs pointers to name what moved into them.

**Comments that cited AGENTS.md for moved text** now cite the guide: `vitest.setup.ts` (`updateNodeInternals` → `rendering.md`) and two comments in `current-domain-vocabulary.test.ts` (the routing carve-out → `domain.md`).

Checks: `pnpm exec vitest run test/unit` (82 files, 1,099 passed, 20 skipped); `pnpm typecheck`; `pnpm exec eslint vitest.setup.ts test/unit/current-domain-vocabulary.test.ts`; `pnpm exec prettier --check` on every changed file.
