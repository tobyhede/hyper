# 02 — Build the typescript-write skill

**What to build:** `.agents/skills/typescript-write/` with `SKILL.md` and three reference files, symlinked into `.claude/skills/`.

**Status:** ready-for-agent

**Why:** The authoring half of the split. Its job is to make idiomatic, provable TypeScript the default behaviour on prompts that never mention TypeScript.

Structure:

```
.agents/skills/typescript-write/
├── SKILL.md
└── references/
    ├── type-system-discipline.md
    ├── boundary-discipline.md
    └── hyper-typescript-patterns.md

.claude/skills/typescript-write -> ../../.agents/skills/typescript-write
```

- [ ] `SKILL.md` in 100–250 lines: workflow and non-negotiable rules only, detail deferred to `references/`. The frontmatter `description` is the part an agent reads before deciding to load anything, so it must say *when*, in terms of what the agent is doing, not what the skill contains — implementation that creates, changes or materially reasons about `.ts`/`.tsx`, even when TypeScript is never mentioned.
- [ ] Sections to carry: the type checker as a proof system, not something to silence; no `any`; inference first; make illegal states unrepresentable; strengthen types only to remove partiality; external values are untrusted until parsed; a type guard must prove its claim; derive rather than duplicate; absence, `undefined` and `null` are three things; collections are partial unless construction says otherwise; exhaust variants; `readonly` where mutation is not the contract; narrow function requirements; verification.
- [ ] Do not restate rules the tooling enforces — point at them. `docs/agents/typescript.md` (issue 01) is the authority and this skill references it.
- [ ] `references/type-system-discipline.md`: adapted from Cursor pstack (MIT) with attribution at the top naming the source and license. Change pstack's absolute *no `as` casts* to this repository's precise form — no narrowing assertions, broadening to `unknown` allowed as local justified containment.
- [ ] `references/boundary-discipline.md`: written for this repository, not generic. Cover HTTP, filesystem JSON, Markdown frontmatter, persistence, environment, third-party `any` leaks. Use `loadSpace` as the one-intake example (ADR 0010) and `src/import/read-single-space.ts:226` as the canonical allowed broadening.
- [ ] `references/hyper-typescript-patterns.md`: real examples from this codebase only. `as const satisfies`; the schema-derived domain types in `packages/core`; an existing discriminated union — `AuthoringRefusal` (ADR 0057) or the `none | card | edge` canvas selection; a total lookup keyed by a closed id union contrasted with partial array indexing. Agents imitate local examples far more strongly than invented ones.
- [ ] Verification section names the real commands: `pnpm typecheck`, `pnpm typecheck:packages`, `pnpm lint`, then `pnpm verify` before completion — and `pnpm e2e` / `pnpm e2e:ladle` where the change warrants them.
- [ ] Validate the structure against the current Agent Skills specification.
- [ ] Track both `.agents/skills/typescript-write/**` and the `.claude/skills/` symlink. Tracking one fixes one harness.
