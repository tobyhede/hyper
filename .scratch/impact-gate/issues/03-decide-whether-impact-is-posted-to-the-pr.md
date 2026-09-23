# 03: Decide whether impact is posted to the PR

**What to build:** a recorded decision on whether the Change impact report is also posted as a sticky pull-request comment (one comment, updated each run), and, if so, the change that posts it.

The job summary is only seen by someone who opens the job. A sticky comment is seen by default. But posting one needs `pull-requests: write`, and `ci.yml` states as a principle that nothing in CI writes to the repository or comments on a PR. So this is a policy call before it is an implementation.

If the answer is yes, ImpactGate's `comment` subcommand posts the markdown report. With two reports, it has to be decided whether to post one combined comment or only the without-tests one.

**Blocked by:** 01: Land the Impact workflow, scored with and without tests, warn only

**Status:** ready-for-human

- [ ] The decision and its reason are recorded in this ticket.
- [ ] If yes: the write permission is scoped to the impact job alone, and `ci.yml`'s stance is untouched.
- [ ] If yes: one comment per PR, updated in place and not duplicated per push.
- [ ] If yes: a missing permission or token degrades to a warning and never fails the job.

## Comments

Evidence from ticket 04 that bears on this decision without settling it. The report's "Top cost drivers" table is not reliable on this repo. ImpactGate takes per-function spans from lizard, and lizard mis-spans our TypeScript in both directions: `ResourcesTrigger`, a 9-line branchless function, is reported at CC 92, and `deriveCompletedEdit` after PR #267 is cut off mid-function at CC 30. A sticky comment would put that table in front of every PR author by default, where the job summary only reaches whoever opens the job. Ticket 05 reduces the defect to a repro, and ticket 04's Answer has the details.
