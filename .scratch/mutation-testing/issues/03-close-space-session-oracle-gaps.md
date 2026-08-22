# 03 — Close the valuable SpaceSession oracle gaps

**What to build:** Strengthen the SpaceSession test oracle wherever the baseline exposed meaningful behavioural gaps, using focused examples for singular ordering or failure scenarios and an observable state-machine property when several survivors express one transition rule.

**Blocked by:** 02 — Establish the unchanged SpaceSession mutation baseline.

**Status:** resolved — two tests added to `packages/persistence/test/session.test.ts` kill all six category-1 survivors; the rerun reports 93/98 killed (94.90%, up from 87/98 and 88.78%) with only the three equivalent and two engine-artefact mutants left alive. `session.ts` is unchanged. Findings in `.scratch/mutation-testing/oracle-space-session.md`; the dead `|| inFlight` clause it uncovered is carried forward as issue `05`.

- [x] Each added test is justified by a meaningful survivor and asserts public session behaviour or recorded backend effects rather than private implementation state.
- [x] Any state-machine model covers only observable semantics such as snapshots, revisions, pending or coalesced submissions, conflicts, retry eligibility, notifications, and backend effects.
- [x] Equivalent mutants and out-of-scope integration concerns are documented rather than killed with artificial assertions.
- [x] The identical baseline mutant set is rerun, and the findings record which previously meaningful survivors the stronger oracle now kills.
- [x] The repository's required verification command passes with the strengthened tests.
