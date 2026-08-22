# 02 — Establish the unchanged SpaceSession mutation baseline

**What to build:** Run a reproducible, time-bounded mutation campaign against SpaceSession and its existing tests without strengthening those tests first, preserving an honest baseline of how well the current suite detects behavioural changes.

**Blocked by:** 01 — Select a mutation engine through a compatibility bake-off.

**Status:** ready-for-agent

- [ ] The campaign targets SpaceSession precisely, invokes the intended existing tests, and is capped at approximately 30 minutes.
- [ ] Baseline results and enough configuration detail to reproduce them are recorded before any test changes.
- [ ] Every survivor is classified as a meaningful behavioural gap, equivalent or unobservable variation, wider-suite concern, timeout, or tooling problem.
- [ ] Mutation score is recorded only as diagnostic evidence and is not introduced as a target, threshold, CI gate, or `verify` gate.

