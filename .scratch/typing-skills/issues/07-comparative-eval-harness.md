# 07 — Comparative eval harness

**What to build:** Nothing yet. The question is whether this repository should run baseline-versus-skill agent evaluations at all.

**Status:** needs-info

**Why parked:** The source specification's Phase 6 is its largest and least-defined chunk — ten adversarial task evals plus trigger evals, each run twice and compared. The argument for it is sound in the abstract: a skill that reads well is not a skill that works, and under-triggering is the most likely failure and the least visible.

What it runs into here:

- No eval runner exists. CI has four deterministic jobs and the stated verification bar is *report the real output of a command*.
- The scoring is only partly mechanical. §23 concedes that modelling quality needs semantic grading, and a check whose verdict varies between runs cannot gate anything.
- Trigger evals are the valuable half and the hardest to automate: whether a skill loads on "add support for deleting an edge" depends on the harness, the model and the surrounding context, none of which this repository controls or pins.
- AGENTS.md says keep to the MVP. A skill evaluation apparatus is a research project adjacent to the product, not part of it.

Questions to answer before this becomes work:

- [ ] Is the aim regression protection for the skills, or one-off confidence that they work? One-off confidence is a session, not infrastructure.
- [ ] What is the verdict, mechanically? If it is *a human read both outputs and preferred one*, say so — that is a legitimate answer and it means no harness.
- [ ] Where would it run? Not in the four CI jobs, given cost and non-determinism.
- [ ] Does issue 06 already cover enough? Fixtures prove the rules bite. What they do not prove is that agents reach for the skill unprompted — which is the actual open risk.

**Recommendation:** do issue 06, then run the ten adversarial tasks once by hand against the finished skills and record what they showed. Revisit a harness only if that pass finds under-triggering worth defending against permanently. Do not gate `.scratch/typescript-7/` on any of this.
