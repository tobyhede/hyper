# 01 — Write docs/agents/typescript.md

**What to build:** The scoped agent document that states this repository's type-system doctrine, in the same register as the other files under `docs/agents/`.

**Status:** ready-for-agent

**Why:** Both skills need one account of the rules to reference. Written second, they grow two accounts that drift. It is also the honest home for the content the source specification wanted to put in AGENTS.md, which carries pointers rather than doctrine.

- [ ] Cover, in the established voice — what is enforced, what is judgment, and which file is authoritative for each:
  - TypeScript 7 is authoritative; the `typescript` name is the 6.x bridge (ADR 0061). Point at the ADR, do not restate it.
  - No repository-authored `any`, explicit or implicit. No `as any`. `as unknown as T` is already blocked by `anti-slop/no-chained-type-assertions`.
  - **`tools/typing-fixtures/must-fail/` is the one exemption, and the doc has to name it.** Every construct this document forbids is deliberately present there, one per file, as ADR 0062's executable evidence that the gates bite. A rule stated without the carve-out makes the repository's own proof read as its worst offender, and an agent acting on that deletes the evidence.
  - No *new* narrowing assertion (ADR 0062). Existing ones are recorded in the suppressions baseline and stand on their `SAFETY:` comments; the baseline only shrinks. Broadening to `unknown` to contain an upstream `any` stays local, justified and commented. Do not describe the baseline as debt.
  - Parse untrusted values once at the boundary; `unknown` is a quarantine type, not a domain model, and does not travel inward.
  - Discriminated unions over correlated booleans and bags of optionals; a new variant fails at every incomplete consumer.
  - Derive from the canonical schema rather than duplicating a shape — this repository's types are already schema-derived, so name that relationship rather than teaching `Pick`/`Omit` generically.
  - `exactOptionalPropertyTypes` makes absent, `undefined` and `null` three different things; narrow optionality near its source.
  - `noUncheckedIndexedAccess` means indexing does not prove existence, and `!` is not the repair.
  - Inference over annotation. Explicitly reject `typedef`, `explicit-function-return-type` and `explicit-module-boundary-types` and say why, so the question does not get re-asked.
  - `satisfies` when the purpose is verification; `as const satisfies Contract` when literals and structure both matter.
  - Strengthen a type to remove partiality, not to maximise precision.
- [ ] State the enforcement boundary explicitly: which of the above the compiler catches, which `eslint.config.js` catches, which `.oxlintrc.json` catches, and which is left to judgment. Anything in the last category is a candidate to become a rule later.
- [ ] Add the entry to AGENTS.md under **Agent skills**, one short paragraph, in the form the existing entries use.
- [ ] `pnpm verify` — `test/unit/agent-skill-commands.test.ts` checks that `pnpm` commands named in agent-facing files exist in root scripts.

**Length discipline:** this is a reference for agents mid-task, not an essay. The other files in `docs/agents/` are the calibration.
