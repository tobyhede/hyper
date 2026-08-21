# 03 — Build the typescript-review skill

**What to build:** `.agents/skills/typescript-review/` with `SKILL.md` and a review rubric, symlinked into `.claude/skills/`, reviewing in a **fresh sub-agent**.

**Status:** ready-for-agent

**Why:** separation of authoring and review is the point, and it has to be mechanical rather than nominal. Reviewed inline, the reviewer inherits every rationalisation the author just produced — it reads its own reasoning back and agrees with it. A "review your work" paragraph appended to the authoring skill is that failure by construction.

There is no name collision: no `typescript-*` skill exists in any installed plugin. The five existing review pathways (`mattpocock-skills:code-review`, superpowers' `requesting-code-review` and `receiving-code-review`, `trailofbits:differential-review`, the built-in `/code-review`) are namespaced or generic, so this sits beside them rather than over them. None of them triggers on TypeScript-specific type-hole review, and a rubric that no trigger loads at review time is not a rubric — which is why this is a skill and not a reference file beside `typescript-write`.

Structure:

```
.agents/skills/typescript-review/
├── SKILL.md
└── references/
    └── review-rubric.md

.claude/skills/typescript-review -> ../../.agents/skills/typescript-review
```

- [ ] Review runs in a fresh sub-agent, following the pattern `mattpocock-skills:code-review` already establishes here — *"parallel sub-agents so they don't pollute each other's context"*, then the skill aggregates. `.scratch/anti-slop/issues/07` records the corroborating failure: a fresh `/code-review` invocation produced a useful report where resumed and re-queried ones returned "confused, self-referential non-answers."
- [ ] **Because the sub-agent starts cold, the skill must tell it where the standards live** — `docs/agents/typescript.md`, ADR 0062, ADR 0057, the anti-slop rules — rather than assuming inherited context. This is extra work in the skill and it is the same work that makes it usable on a PR nobody in the session wrote.
- [ ] `SKILL.md` compact, loading the rubric only when needed. It reads `typescript-write` first, so the standard reviewed against is the standard authored against.
- [ ] Frontmatter `description` triggers on TypeScript PR and diff review, and after completing a material TypeScript implementation before declaring it done — including on a bare "review this change" over a TypeScript diff.
- [ ] **Blocking** findings: explicit or implicit `any`; `as any`; `as unknown as T`; a **new** narrowing assertion (existing ones are in the ADR 0062 baseline and are not findings); a production non-null assertion; `@ts-ignore`; an unjustified `@ts-expect-error`; external data treated as trusted without parsing.
- [ ] **High priority** modelling defects: correlated booleans; bags of optionals standing in for mutually exclusive states; broad primitives where a domain type exists; a duplicated canonical shape; a function taking a far wider object than it uses; `unknown` surviving past the trust boundary; a default branch hiding an addition to a closed union; a partial operation followed by an assertion; a type weakened to make an error go away.
- [ ] **Medium priority** idiom: redundant annotations; an annotation or assertion where `satisfies` was meant; generics that abstract nothing; a type guard that does not validate its predicate; mutable parameters where mutation is not intended; hand-rolled mapped types duplicating standard utilities; a comment compensating for a type that should carry the invariant.
- [ ] Say plainly that text matching is **triage only**. Grepping `any`, ` as `, `!`, `@ts-`, `unknown`, `JSON.parse`, `Record<string, unknown>` finds candidates; judgment comes from compiler types, typed ESLint, LSP hover information, the canonical schemas and actual control flow. Do not flag every `unknown` or every `as const`. Do not flag a suppressed assertion.
- [ ] Carry the standing instruction: when a finding recurs, ask whether it can become a compiler, lint or test invariant, and prefer improving the deterministic tooling over relying on the skill indefinitely.
- [ ] Verification: `pnpm typecheck` and `pnpm lint` at minimum; `pnpm verify` for a completed implementation.
- [ ] Track both paths, as with issue 02.
