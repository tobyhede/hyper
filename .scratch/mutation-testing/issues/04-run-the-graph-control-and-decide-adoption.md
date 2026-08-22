# 04 — Run the graph-intake control and decide adoption

**What to build:** Apply the same bounded mutation method to the mature, property-tested graph intake boundary, compare its useful findings and effort with SpaceSession, and make an evidence-backed recommendation to adopt, revise, or remove the mutation-testing setup.

**Blocked by:** 03 — Close the valuable SpaceSession oracle gaps.

**Status:** ready-for-agent

- [ ] The graph-intake control uses the selected engine, a precise target, the existing example and property tests, and approximately the same campaign budget as SpaceSession.
- [ ] Survivors are classified with the same categories used for the SpaceSession baseline so the comparison is meaningful.
- [ ] The findings compare useful behavioural gaps, equivalent or noisy mutants, runtime, and review effort rather than comparing mutation scores alone.
- [ ] The recommendation explicitly chooses adoption, revision, or removal and records the evidence supporting that choice.
- [ ] If adopted, mutation testing remains an explicit local command without a score threshold or CI/`verify` gate; broader property-testing work is proposed only where campaign evidence supports it.
- [ ] The repository's required verification command passes with the final retained setup.
