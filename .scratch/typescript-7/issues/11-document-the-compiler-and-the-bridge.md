# 11 — Document the compiler and the bridge

**What to build:** The AGENTS.md and `docs/agents/` changes that make ADR 0061's arrangement legible to the next agent who opens `package.json` and thinks it is broken.

**Status:** ready-for-agent

**Why:** The bridge's whole risk is that it looks like a mistake. Undocumented, it gets "fixed".

- [ ] Add the trap to AGENTS.md under **Conventions & gotchas**: `tsc` is TypeScript 7 and authoritative; the package name `typescript` deliberately resolves to the TypeScript 6 compatibility API for `typescript-eslint`; TypeScript 6 diagnostics are not normative; do not change source to satisfy it; do not unify the names.
- [ ] Add ADR 0061 and ADR 0062 to the **Decided — read these before the code** section with their real build status, in the established form (what is built and what is not).
- [ ] Record the bridge's removal condition — where a reader will find it, not buried in a commit message. ADR 0061 states it; AGENTS.md should point at it.
- [ ] Update the **Commands** section: `verify` now runs `typecheck:toolchain` first, and the reason is one sentence, not a paragraph.
- [ ] Update `docs/agents/anti-slop.md`'s account of assertion policy. It currently describes the `SAFETY:` comment as the whole rule, and after ADR 0062 there are two rules doing different jobs: the comment demands a reason, `no-unsafe-type-assertion` caps the count. Say that the comment rule is unchanged and still applies to every surviving assertion.
- [ ] Document the suppressions baseline where someone will find it before misreading it: what it is, that it only shrinks, that `--prune-suppressions` runs in `verify`, and that it is never hand-edited. A committed file listing 79 violations invites exactly two wrong conclusions — that the rule is decorative, or that the file is a backlog to schedule.
- [ ] Keep AGENTS.md short. The doctrine belongs in `docs/agents/typescript.md`, which `.scratch/typing-skills/` issue 01 owns.
- [ ] `pnpm verify` — `test/unit/agent-skill-commands.test.ts` reads documented `pnpm` commands and will fail if `typecheck:toolchain` is described but absent from root scripts.

**Do not** write a twenty-bullet `## TypeScript` section into AGENTS.md as the source specification suggested. That fights the structure this repository already uses, where AGENTS.md carries pointers and `docs/agents/*.md` carries detail.
