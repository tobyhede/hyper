# 04: Decide whether and how impact gates a merge

**What to build:** a recorded decision on the role of change impact in merging, backed by calibrated grades from real pull requests. The options:

- stay warn-only (a report, never a gate)
- block on the without-tests grade at a chosen percentile
- make the impact job one the `ci` gate depends on

The decision waits for ticket 02, because a gate on the seed curve alone would block nearly every multi-file branch this repo produces. The formula multiplies by files changed, and both dry-run branches graded p99.5.

Whether the with-tests score should gate at all is part of the decision. Test churn raises it without adding structural decay to production code, which is what the tool exists to catch.

**Blocked by:** 02: Grade against this repo's own history, not only the seed curve

**Status:** ready-for-human

- [ ] Calibrated grades from a representative set of merged PRs are collected in this ticket, with the method.
- [ ] The decision, the score it gates on (if any), and the percentile are recorded with reasons.
- [ ] If it gates: the threshold is set in configuration, not scattered across flags, and a blocked PR's report says what to refactor.
- [ ] If it joins the `ci` gate: `CLAUDE.md`'s description of the CI jobs is updated in the same change.
