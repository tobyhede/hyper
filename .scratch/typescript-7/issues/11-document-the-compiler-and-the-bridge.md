# 11 — Document the compiler and the bridge

**What to build:** The AGENTS.md and `docs/agents/` changes that make ADR 0061's arrangement legible to the next agent who opens `package.json` and thinks it is broken.

**Status:** resolved

**Why:** The bridge's whole risk is that it looks like a mistake. Undocumented, it gets "fixed".

- [x] Add the trap to AGENTS.md under **Conventions & gotchas**: `tsc` is TypeScript 7 and authoritative; the package name `typescript` deliberately resolves to the TypeScript 6 compatibility API for `typescript-eslint`; TypeScript 6 diagnostics are not normative; do not change source to satisfy it; do not unify the names.
- [x] Add ADR 0061 and ADR 0062 to the **Decided — read these before the code** section with their real build status, in the established form (what is built and what is not).
- [x] Record the bridge's removal condition — where a reader will find it, not buried in a commit message. ADR 0061 states it; AGENTS.md should point at it.
- [x] Update the **Commands** section: `verify` now runs `typecheck:toolchain` first, and the reason is one sentence, not a paragraph.
- [x] Update `docs/agents/anti-slop.md`'s account of assertion policy. It currently describes the `SAFETY:` comment as the whole rule, and after ADR 0062 there are two rules doing different jobs: the comment demands a reason, `no-unsafe-type-assertion` caps the count. Say that the comment rule is unchanged and still applies to every surviving assertion.
- [x] Document the suppressions baseline where someone will find it before misreading it: what it is, that it only shrinks, that `--prune-suppressions` runs in `verify`, and that it is never hand-edited. A committed file listing 79 violations invites exactly two wrong conclusions — that the rule is decorative, or that the file is a backlog to schedule.
- [x] Keep AGENTS.md short. The doctrine belongs in `docs/agents/typescript.md`, which `.scratch/typing-skills/` issue 01 owns.
- [x] `pnpm verify` — `test/unit/agent-skill-commands.test.ts` reads documented `pnpm` commands and will fail if `typecheck:toolchain` is described but absent from root scripts.

**Do not** write a twenty-bullet `## TypeScript` section into AGENTS.md as the source specification suggested. That fights the structure this repository already uses, where AGENTS.md carries pointers and `docs/agents/*.md` carries detail.

## Comments

Landed, and kept to pointers as the ticket asks — no twenty-bullet `## TypeScript` section.

**`CLAUDE.md` is a symlink to `AGENTS.md`**, so there is one file to edit and both harnesses see it.

**Decided section** gains ADR 0061 and ADR 0062, both marked **built**, each stating what holds and what must not be "fixed". ADR 0061's entry points at the ADR for the removal condition rather than restating it, and names the `@ladle/react` patch, which would otherwise read as arbitrary.

**Conventions & gotchas** gains two entries, placed where a reader meets the surprise: one on `package.json`'s inverted TypeScript names, one on `eslint-suppressions.json` being a ceiling rather than a backlog.

**Commands** now lists `typecheck:toolchain` first with the one-sentence reason — a typecheck against the wrong compiler still passes, so proving which `tsc` ran has to come before trusting what it said. The step list was also stale in two other ways and both are corrected: `ui:catalog:check` was missing entirely, and `lint` now carries `--prune-suppressions`.

**`docs/agents/anti-slop.md`** gains a "Two rules on assertions" section. The `require-safety-comment-for-type-assertion` bullet now says outright that ADR 0062 left it unchanged and that it still applies to every surviving assertion, and points at the new section rather than continuing to read as the whole policy. The section carries the baseline explanation — naming both wrong readings the ticket predicted, that the rule is decorative and that the file is a backlog — plus how to regenerate it, why it is in `.prettierignore`, and what `test/unit/assertion-ratchet.test.ts` will fail on. A short subsection covers the fixtures and states that a passing `must-fail` fixture is a finding.

**Both ADRs** now carry `Build status: built` and an **As built** section recording what the implementation taught that the decision could not know: for 0061, the real `@ladle/react` cause (a relocated diagnostic escaping a third-party `//@ts-ignore`, *not* a program-membership difference as the ticket assumed) and the measurements behind it; for 0062, that `--prune-suppressions` makes a stale baseline silently rewritten rather than failing, and that the `JSON.parse(...) as T` idiom is now banned for new code, which is a real tax on a common shape in tests.

### Verification

`pnpm verify` — exit 0; 142 test files, 1481 passed, 8 skipped. `test/unit/agent-skill-commands.test.ts` passes, so every `pnpm` command the documentation now describes exists in root scripts.
