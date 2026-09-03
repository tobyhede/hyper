# 02 — Parity evidence survives a partial run

**What to build:** The parity claim check no longer requires that one process observe every test. Collecting the whole suite and asserting each claim is tagged exactly once becomes a cheap browserless check in `verify`; the assertion that a claim's test actually passed is retired, because a green run already means it.

**Blocked by:** None — can start immediately.

**Status:** resolved — the browserless check turned out to already exist and already run in `verify` (`pnpm ui:catalog:check`), so `scripts/parity-reporter.ts` was deleted rather than split. `pnpm exec playwright test --shard=1/3` now passes, 52/52. Ticket 03 is unblocked.

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

## Answer — nothing was built; a duplicate was deleted

**The browserless check this ticket asks for already exists, and has been running in `verify` the whole time.** `scripts/ui-catalog.ts` — `pnpm ui:catalog:check`, fourth step of `verify` — reads `packages/app/stories/parity-claims.ts` and walks `packages/app/e2e` and `packages/app/ladle-e2e` with the TypeScript AST, counting `@parity:` tags off the same `PARITY_TAG_PREFIX` the reporter imported, and reports:

```
parity claim <id> requires exactly one Ladle test; found N
parity claim <id> requires exactly one application test; found N
```

It carries the exemption asymmetry exactly as the reporter did — every claim owes a Ladle test, and only a claim without `applicationEvidence` owes an application test — it names the suite in every message, and it names the *file* on an unknown tag, which the reporter did not. So the reporter's `onBegin` was a second copy of an invariant already stated, and this ticket's instruction not to end up with the exemption rules written down twice was already violated before the ticket was written.

Writing a third statement of it would have been the wrong move. `scripts/parity-reporter.ts` is deleted, both configs drop to `reporter: [['list']]`, and the comment that replaces the reporter entry in `playwright.config.ts` says where the invariant lives and why it is not restated here. `scripts/parity-tag.ts` stays: one consumer now instead of two, but it is where the tag prefix is named, and folding it into `ui-catalog.ts` is churn this ticket did not ask for.

**"the undefined suite" is closed by the reporter no longer existing.** The cause was worth recording anyway: `--reporter='./scripts/parity-reporter.ts'` on the command line has no syntax for reporter options, so the constructor received `undefined` and read `.suite` off it. Only the config form ever passed `{ suite: … }`. A check invoked as a script rather than as a reporter cannot acquire that failure mode.

### The naming on failure is not worth preserving — and is not actually lost

Retiring `onEnd` was supposed to cost the by-name report of a claim whose test failed. Measured, it costs nothing: Playwright appends every tag that is not already in the title to the reported title (`formatTestTitle` in `playwright/lib/runner/index.js`), so a failing tagged test prints its claim id in the failure header *and* again in the run summary:

```
  ✘  1 …/t/a.spec.ts:2:5 › a tagged claim test @parity:some-claim-id (3ms)
  1) …/t/a.spec.ts:2:5 › a tagged claim test @parity:some-claim-id
  1 failed
    …/t/a.spec.ts:2:5 › a tagged claim test @parity:some-claim-id
```

(Reproduced against a throwaway one-test config, since no tagged test in the tree fails.) Both green runs below show the same thing on the passing side — every tagged test line ends in its `@parity:` tag.

The reporter's version was strictly worse: one line, at the very end, after the failure summary, naming the claim but not the assertion. So the deliberate call is to drop it, and the reason is written into `scripts/ui-catalog.ts` beside the check — `failOnFlakyTests` already means a green run had no failure and no retry, and the claim is named at the failure by Playwright itself — so a later reader does not add the second assertion back.

### The one thing genuinely given up

A source scan and a Playwright collection are not the same set. `ui-catalog.ts` counts a literal `test('…', { tag: … })` call under `packages/app/e2e` or `packages/app/ladle-e2e`; Playwright counts what its projects actually collect. They can disagree three ways: a tagged spec no project matches (both configs' projects currently partition their `testDir`, so none today), a test whose tags are computed rather than literal (none today), and a test that calls `test.skip(condition)` in its own body at run time (none today — `grep` finds no runtime skip in either directory). Static `test.skip`/`fixme`/`describe.skip` are *better* covered than before: the AST scan rejects them as evidence in `verify`, where the reporter only noticed at the end of a browser run.

That is a real narrowing and it is accepted, because each of the three ways needs a source change to arise, and the first two would have to survive review of a file that visibly does something no other spec does.

### Test

`test/unit/ui-catalog.test.ts` already had the "found 0" half of the invariant, in both suites, plus the exclusion and exempt-but-tagged cases. It had no test for the *other* half — the half `onBegin` owned — so one was added over both suites:

```
rejects a claim two application tests both tag
rejects a claim two Ladle tests both tag
```

Both bite: relaxing `matches.length !== 1` to `matches.length < 1` in `ui-catalog.ts` fails exactly those two of the file's 65 tests and nothing else.

## Acceptance criteria

- [x] The "every claim collected exactly once" invariant runs as its own check over the full suite, without launching a browser, and covers both the application and Ladle configurations with their existing exemption rules. — `pnpm ui:catalog:check`, which already did.
- [x] That check runs in `verify`, and its cost there is recorded. — See Measured; it is the fourth of eight steps and costs ~0.9s of a 132s `verify`, and the change adds **zero** to that, the check having already been there.
- [x] Its failure output names the suite it is talking about. — `requires exactly one Ladle test` / `requires exactly one application test`, shown below on a real mistag.
- [x] `playwright test --shard=1/3` completes without a parity failure. — 52 passed, exit 0.
- [x] The reasoning for retiring the pass/non-flaky assertion — that `failOnFlakyTests` already guarantees it — is written into the code that replaces it. — In `scripts/ui-catalog.ts` above the evidence scan, and in `playwright.config.ts` where the reporter entry was.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green, and a deliberately mistagged claim is shown to still fail the check.

## Measured

Local, this worktree.

```
pnpm ui:catalog:check          0.90s / 0.87s / 0.98s      (unchanged; already in verify)
pnpm verify                    132s, exit 0   173 files, 2149 passed, 2 skipped
pnpm e2e                       240s, exit 0   156 passed
pnpm e2e:ladle                  75s, exit 0    73 passed
playwright test --shard=1/3 --list             exit 0  (was exit 1)
playwright test --shard=1/3     71s, exit 0    52 passed  (was a parity failure)
```

The mistag proof, run against the real tree and then reverted:

```
$ # one claim's application tag misspelled
- unknown parity tag @parity:canvas-card-shows-active-graph-colourX in packages/app/e2e/overview.spec.ts
- parity claim canvas-card-shows-active-graph-colour requires exactly one application test; found 0

$ # one extra spec in each directory tagging a claim that already has its test
- parity claim canvas-card-shows-active-graph-colour requires exactly one Ladle test; found 2
- parity claim canvas-card-shows-active-graph-colour requires exactly one application test; found 2
$ echo $?
1
```

The interesting number is the one that is not there. This ticket budgeted for a new check in `verify` and its cost; the cost is nil, because the work was to remove the second copy of a check rather than to add a first. Ticket 03 gets its shardable suite for one deleted 61-line module, and every line added in its place outside the tests is a comment.
