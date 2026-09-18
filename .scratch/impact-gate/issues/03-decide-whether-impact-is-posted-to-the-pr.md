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
