# 02 — Parity evidence survives a partial run

**What to build:** The parity claim check no longer requires that one process observe every test. Collecting the whole suite and asserting each claim is tagged exactly once becomes a cheap browserless check in `verify`; the assertion that a claim's test actually passed is retired, because a green run already means it.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Why

`scripts/parity-reporter.ts` does two things in one reporter, and only one of them needs the whole suite.

`onBegin` walks every collected test and reports a claim collected zero or twice. That is a real invariant and it genuinely needs the full collection — it is what stops a claim silently losing its evidence.

`onEnd` then checks each tagged test finished `expected`. Under CI both Playwright configs set `failOnFlakyTests`, so a run is green only if every test passed without a retry. The reporter's second assertion is therefore already implied by the run being green, for every test rather than just the tagged ones.

Because both live in a reporter attached to the run, any partial run fails:

```
$ pnpm exec playwright test --shard=1/3 --list --reporter='./scripts/parity-reporter.ts'
Parity evidence failed in the undefined suite:
- claim cards-drawer-keeps-an-add-refusal-on-its-surface was collected 0 times; expected once
  … 30 more
```

This is the only thing stopping the e2e suite being sharded, and it gates ticket 03. The usual answer — blob reports merged by a `merge-reports` job — would buy back the collection check at the cost of a job on the critical path that pays checkout and install again for it. Splitting the two assertions is cheaper and puts each where it belongs: the collection invariant needs no browser and takes seconds, and the outcome invariant needs nothing at all.

Note `--list` already runs `onBegin`, which is what makes the collection check almost free.

## What to be careful about

The check runs over **both** suites, and they have different rules — the application suite exempts a claim whose `applicationEvidence` names a reason instead of a test, and the Ladle suite exempts none. Whatever shape this takes has to keep both, and keep reporting the suite name (the run above printing "the undefined suite" is a defect worth closing while you are here).

Retiring `onEnd` weakens one thing and it should be a deliberate call rather than a silent consequence: today a claim's test failing is reported as *that claim* losing its evidence, by name. Afterwards it is reported as an ordinary test failure. Decide whether that naming is worth keeping and say so here.

## Acceptance criteria

- [ ] The "every claim collected exactly once" invariant runs as its own check over the full suite, without launching a browser, and covers both the application and Ladle configurations with their existing exemption rules.
- [ ] That check runs in `verify`, and its cost there is recorded.
- [ ] Its failure output names the suite it is talking about.
- [ ] `playwright test --shard=1/3` completes without a parity failure.
- [ ] The reasoning for retiring the pass/non-flaky assertion — that `failOnFlakyTests` already guarantees it — is written into the code that replaces it, so a later reader does not restore it.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green, and a deliberately mistagged claim is shown to still fail the check.
