# 02 — Establish the unchanged SpaceSession mutation baseline

**What to build:** Run a reproducible, time-bounded mutation campaign against SpaceSession and its existing tests without strengthening those tests first, preserving an honest baseline of how well the current suite detects behavioural changes.

**Blocked by:** 01 — Select a mutation engine through a compatibility bake-off.

**Status:** resolved — baseline recorded in `.scratch/mutation-testing/baseline-space-session.md`: 98 mutants, 87 killed, 11 survived, 88.78%, 36.8s, with every survivor classified and both `static: true` survivors hand-falsified as engine artefacts.

- [x] The campaign targets SpaceSession precisely, invokes the intended existing tests, and is capped at approximately 30 minutes.
- [x] Baseline results and enough configuration detail to reproduce them are recorded before any test changes.
- [x] Every survivor is classified as a meaningful behavioural gap, equivalent or unobservable variation, wider-suite concern, timeout, or tooling problem.
- [x] Mutation score is recorded only as diagnostic evidence and is not introduced as a target, threshold, CI gate, or `verify` gate.

**Result:** `pnpm mutate:session` at commit `13dfa60`, 98 mutants / 87 killed /
11 survived / 88.78% / 36.8s wall clock — ~2% of the ~30-minute cap. Survivor
categories against `.scratch/mutation-testing/survivor-classification.md`:
**6 x category 1** (meaningful behavioural gap), **3 x category 2** (equivalent
or unobservable), **0 x category 3**, **0 x category 4**, **2 x category 5**
(tooling problem — both `static: true`, hand-falsified). No source or test file
was modified: the three temporary hand-mutations used for falsification were each
reverted and proved clean with `git diff --exit-code`.
