# 12 — Stabilise the E2E fixture startup gate

**What to fix:** Make the full Playwright suite reliably expose the fixture Cards
when its first editing tests start, so the required `pnpm e2e` gate is green as
a suite rather than only on immediate rerun.

**Blocked by:** None.

**Status:** resolved

**Delivered by:** PR #72 — Fix E2E fixture startup race.

- [x] Reproduce the full-suite failure where the first three editing tests cannot find Card `A` while Vite reports dependency re-optimisation.
- [x] Determine whether readiness, worker isolation, dependency optimisation or fixture-host startup is responsible; preserve the fresh-host and isolated-repository guarantees.
- [x] Add a regression that fails on the identified startup race rather than increasing locator timeouts or hiding retries.
- [x] The three affected editing tests pass in their original suite positions and `pnpm e2e` passes repeatedly from a clean Playwright/Vite state.
- [x] `pnpm verify` passes.

## Resolution

Concurrent fixture hosts were mutating one Vite dependency-optimizer cache.
PR #72 scopes that cache per Playwright worker and enables Playwright's native
`failOnFlakyTests` CI policy while retaining diagnostic retries.

## Decision note

Issue 08's parity-enforcement grilling established a repository-wide CI rule:
diagnostic Playwright retries may remain, but any flaky result fails the job.
The full-suite-only Vite/fixture startup race recorded here must therefore be
diagnosed and fixed; retries and parity exceptions are not acceptable outcomes.
