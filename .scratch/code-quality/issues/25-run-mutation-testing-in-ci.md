# 25: Run mutation testing in CI

**Status:** needs-triage — deferred by Toby Hede (2026-09-25) and excluded from the active queue (`../DECISIONS-2026-09-25.md`). The decisions below stay open until it is picked up again.

**Blocked by:** None; follows the Stryker decision in 13

**What to build:** A CI job that runs the StrykerJS campaigns, so the mutation findings stop depending on someone remembering to run `pnpm mutate:*` by hand. Ticket 13 recorded the decision to keep Stryker and run it in CI (2026-09-25); the CI half was then deferred.

This reverses a standing rule. AGENTS.md, `docs/agents/build-tooling.md` and the comment at the top of `stryker.conf.mjs` all say mutation testing is "a deliberate local diagnostic, never a gate": it is not in `verify` or CI, `thresholds.break` is `null`, and the tickets that introduced it forbid a threshold (`.scratch/mutation-testing/`). The change therefore needs an ADR, and every one of those passages has to be updated in the same change.

## To decide

- **Gate or report.** Either the job fails on a score or survivor threshold, or it only publishes the report as an artifact. A gate is what the original tickets forbade. The option ticket 13 raised was a ratchet on the survivor count rather than a score.
- **Trigger.** Run on every push, or only when a campaign's `--mutate` or `--testFiles` paths change (`ci.yml` has no path filtering today, so this would be its first). Each campaign takes 17–37s locally, plus install.
- **Campaigns.** There are two today, `mutate:session` and `mutate:graph`. Each pairs its mutated files with an oracle chosen by hand, because the whole suite cannot run inside Stryker's sandbox (`test/unit`'s repo-meta test shells out to `git ls-files`). A CI job makes that pairing load-bearing. Decide whether anything checks that the pairing still makes sense.
- **Known false survivors.** `.scratch/mutation-testing/engine.md` records this runner's `static: true` false survivors. A gate or ratchet has to account for them.

## Acceptance

- [ ] An ADR records the gate-or-report choice, the trigger and the campaign set, and supersedes or amends the "never a gate" rule
- [ ] A CI job runs the chosen campaigns on the chosen trigger and publishes the HTML report
- [ ] AGENTS.md, `docs/agents/build-tooling.md` and `stryker.conf.mjs` describe the new arrangement
- [ ] If the job is a required input to `CI passed`, `ci-container-image-pin` and any other CI-shape test still pass
