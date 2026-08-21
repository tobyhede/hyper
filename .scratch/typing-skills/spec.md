# TypeScript authoring and review skills

Give agents working in this repository a canonical TypeScript authoring skill and an independent review skill, so that what the compiler and linter cannot mechanically enforce is at least consistently taught and independently checked.

The work is complete when `typescript-write` triggers on ordinary implementation prompts that never mention TypeScript, when `typescript-review` approaches finished code with reviewer's intent rather than as an appendix to authoring, when both are reachable from both harnesses through the established symlink pattern, and when the guidance they carry does not contradict the rules already enforced by `eslint.config.js` and `.oxlintrc.json`.

Source: `Hyper TypeScript 7 + Pervasive Typing Agent Skills — Implementation Specification.md` (21 August 2026), Phases 3–6. Phases 1–2 are `.scratch/typescript-7/`.

## The governing constraint

Skills are guidance; the compiler, the linter and the tests are enforcement. A rule that can be mechanical should be a rule, not a paragraph. Every recurring review finding is a question: can this become a compiler, lint or test invariant? The two skills exist for the residue that genuinely cannot — modelling judgment, boundary placement, knowing when a stronger type removes partiality and when it is ceremony.

That constraint also bounds the content. Roughly half the doctrine in the source document is already enforced by `strictTypeChecked` plus the fifteen anti-slop rules, and ADR 0062 adds the assertion ratchet on top. A skill that re-states an enforced rule adds words and no proof, and drifts from the rule the day the rule changes. The skills should teach what the tooling cannot check, and *point at* what it can.

ADR 0062 also sharpens what these skills are *for*. Grilling it established that the live risk is not the code already written — that was reviewed — but what an agent writes next, because a `SAFETY:` comment requirement is satisfied by prose and prose is the cheapest thing an agent produces. That is the same gap `typescript-write` addresses, which makes the two complementary rather than redundant: the rule caps the count, the skill shapes what gets written before the rule has to say no.

## Corrections to the source document

- **`skills-lock.json` is for vendored upstream skills only.** It records `shadcn` and deliberately not the repo-owned `shadcn-first-ui`. Both new skills are repo-owned and stay out of the lock; the checked-in files are the source of truth, with upstream provenance recorded in the reference files.
- **AGENTS.md gets a pointer, not a doctrine.** The established structure is a short entry under **Agent skills** plus a scoped `docs/agents/*.md`. The source document's twenty-bullet `## TypeScript` section belongs in `docs/agents/typescript.md`.
- **Phase 6 is not one piece of work.** Fixture-based evidence that the tooling itself produces is deterministic and cheap; a baseline-versus-skill comparison with semantic grading is a research project with no runner, no CI home and a non-deterministic verdict. The fixtures moved to `.scratch/typescript-7/` issue 06, because they prove a claim about the rules rather than about the skills; issue 07 is parked. Trigger evidence is one recorded manual pass in issue 04.
- **The reviewer must run cold.** The source document says to separate authoring from review but not how, and inline review is that separation in name only — the reviewer inherits the author's rationalisations and agrees with them. `typescript-review` dispatches a fresh sub-agent, which is the pattern `mattpocock-skills:code-review` already establishes in this environment and which `.scratch/anti-slop/issues/07` records evidence for.
- **The proposal's own §10 was already true** and the corresponding skill text should say so rather than teaching a rule as if it were new.

## Licensing

Cursor pstack (`typescript-best-practices`, `principle-type-system-discipline`, patterns) is MIT and may be copied and adapted with attribution. Metabase's `typescript-write` and `typescript-review` are AGPL outside `enterprise`: take the architecture — the authoring/review split, blocking `any`, using inferred and LSP types during review — and write this repository's wording independently. Do not paste their prose.

## The grilling record

**The problem here is a mechanism, not a content gap.** `docs/agents/anti-slop.md` already teaches type evidence, parsing boundaries and assertion discipline, and no agent-authored typing defect is recorded in the tracker — so on content alone this effort would fail the same test that shrank ADR 0062. What justifies it is that `docs/agents/*.md` files are read when AGENTS.md points an agent at the area it is touching, and TypeScript has no "area": it is every change. A skill's trigger description fires regardless. That is something the docs genuinely cannot do, and it is the whole argument.

**`typescript-review` was nearly dropped, wrongly.** The recommendation to fold its rubric into a reference file beside `typescript-write` contradicted the argument above — a reference file loads only when the authoring skill loads, which is never at review time. It is a skill, with its own trigger, or it does not exist. The collision worry that partly motivated dropping it was also unfounded: no `typescript-*` skill exists in any installed plugin.

**Both skills are unmeasured and that is accepted.** With the comparative harness parked and the fixtures moved out, this effort has no machine-checked output. The cover is one recorded manual trigger pass (issue 04) plus naming both skills in AGENTS.md's verification bar so they are reachable by instruction when the trigger misses.

## Out of scope

Everything in `.scratch/typescript-7/`; a branded-primitive campaign; new custom lint rules; changing which skills are vendored; and the comparative eval harness (issue 07, parked).

## Sequence

**After `.scratch/typescript-7/` completes, not alongside it.** Issue 01's document has to state which compiler is authoritative and what the assertion rule is; written against a toolchain still in motion it would only be rewritten.

Then issue 01 first — the doctrine document is what both skills reference, and writing it first stops the two skills growing separate accounts of the same rules. Issues 02 and 03 follow, then 04, which carries the trigger pass. Issue 05 rides with whichever of 02 and 03 lands first. Issue 06 is closed and issue 07 is parked.
