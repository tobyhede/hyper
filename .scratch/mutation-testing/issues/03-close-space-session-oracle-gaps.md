# 03 — Close the valuable SpaceSession oracle gaps

**What to build:** Strengthen the SpaceSession test oracle wherever the baseline exposed meaningful behavioural gaps, using focused examples for singular ordering or failure scenarios and an observable state-machine property when several survivors express one transition rule.

**Blocked by:** 02 — Establish the unchanged SpaceSession mutation baseline.

**Status:** ready-for-agent

- [ ] Each added test is justified by a meaningful survivor and asserts public session behaviour or recorded backend effects rather than private implementation state.
- [ ] Any state-machine model covers only observable semantics such as snapshots, revisions, pending or coalesced submissions, conflicts, retry eligibility, notifications, and backend effects.
- [ ] Equivalent mutants and out-of-scope integration concerns are documented rather than killed with artificial assertions.
- [ ] The identical baseline mutant set is rerun, and the findings record which previously meaningful survivors the stronger oracle now kills.
- [ ] The repository's required verification command passes with the strengthened tests.

