# 04 — Run the graph-intake control and decide adoption

**What to build:** Apply the same bounded mutation method to the mature, property-tested graph intake boundary, compare its useful findings and effort with SpaceSession, and make an evidence-backed recommendation to adopt, revise, or remove the mutation-testing setup.

**Blocked by:** 03 — Close the valuable SpaceSession oracle gaps.

**Status:** resolved — the control ran in 17.6s over 148 mutants, all 25 non-killed mutants are classified (1 → 10, 2 → 8, 3 → 6, 4 → 0, 5 → 1), and the recommendation is **ADOPT** as an explicit local command with no threshold and no gate. Findings in `.scratch/mutation-testing/graph-control-and-adoption.md`; the one behavioural follow-up is issue `06`.

- [x] The graph-intake control uses the selected engine, a precise target, the existing example and property tests, and approximately the same campaign budget as SpaceSession.
- [x] Survivors are classified with the same categories used for the SpaceSession baseline so the comparison is meaningful.
- [x] The findings compare useful behavioural gaps, equivalent or noisy mutants, runtime, and review effort rather than comparing mutation scores alone.
- [x] The recommendation explicitly chooses adoption, revision, or removal and records the evidence supporting that choice.
- [x] If adopted, mutation testing remains an explicit local command without a score threshold or CI/`verify` gate; broader property-testing work is proposed only where campaign evidence supports it.
- [x] The repository's required verification command passes with the final retained setup.

Notes on what each criterion actually cost, for whoever reads this next:

- **Budget.** 17.6s for the headline campaign and 43s for all three runs including the two property-vs-example diagnostics — 1% of the ~30-minute cap, against SpaceSession's 36.8s. No mutation range was applied and nothing was cut, so the numbers cover the whole of `packages/graph/src/space.ts`. The `mutate:graph` script was checked against the target and left unchanged.
- **Classification.** 16 survivors **plus 9 `NoCoverage` mutants**, which `session.ts` did not have; all 25 are classified, because a mutant no test reaches is un-killed in the strongest sense.
- **Comparison.** The two scores (88.78% and 83.11%) are stated as non-comparable, with four reasons. The comparison that carries the decision is category-1 rules and review minutes: 2 rules / ~11 measured survivors there, 3 rules / 25 here, with 60% of this campaign's review producing no action.
- **The control's own question is answered, and the answer is no.** The hypothesis that a property-tested boundary has nothing left for a mutation campaign is falsified: eight survivors say neither loader is proved to refuse `null`. Separately, the property tests kill exactly **one** mutant of 148 the examples do not, and the examples kill 75 the properties do not — which is why the only property proposed is the one those eight survivors point at.
- **Gate check.** `thresholds.break: null` (`stryker.conf.mjs:94`), `grep -rn "mutate\|stryker" .github/workflows/` finds nothing, and `verify` does not call it. All three checked at commit `552f915`.
