# 29 — Apply the comment rule to tests, stories and e2e

**What to build:** Apply the comment rule that ticket 10 applied to source to `packages/*/test`, `test/`, `packages/*/stories`, `packages/*/e2e` and `packages/*/ladle-e2e`.

**Blocked by:** 10 (the rule and its application to source).

**Status:** needs-triage

**Priority:** P3

**Why:** Ticket 10 scoped the sweep to source. A rough scan for history phrasing ("used to", "before ADR", "this replaced", "no longer") on the ticket 10 branch finds 168 hits in 89 test, story and e2e files. The scan overcounts, because "no longer" is often a legitimate present-tense statement. Treat it as a size estimate, not a worklist.

- [ ] Remove lineage, rejected alternatives and unrecorded measurements. Keep the invariant each one guarded, in the present tense.
- [ ] Keep what a gate reads: `SAFETY:` comments, the comment in an intentionally empty block, and comments a scanning test asserts are present.
- [ ] Split by package if the diff grows past a reviewable size.
