# 03 — Shard the e2e job across three runners

**What to build:** CI's `e2e` job becomes a three-way matrix. Each runner executes a third of the suite and is green on its own; a failure in any shard fails the gate and uploads its own report. The suite's wall clock stops being the sum of every test and becomes the slowest third.

**Blocked by:** 01 (a load-sensitive test breaks under a new concurrency shape), 02 (the parity reporter fails any partial run).

**Status:** resolved — `e2e` is a three-way `fail-fast: false` matrix, each shard uploading `playwright-report-shard-<n>`; all three shards proven green locally at 52 tests each. One criterion stays open until the first CI run reads the real slowest-shard duration.

## Why

Measured on the pre-merge tree, which has the same 156 tests in the same ten files:

```
local, 4 workers    98s wall,  382s summed test time
local, 8 workers   110s wall,  848s summed test time
CI,    2 workers   202s wall  (382/2 — the runner is 4 vCPU, Playwright takes cores/2)
```

Two things follow. The suite is **CPU-saturated**: raising workers past cores/2 made it slower on both wall clock and total work, so more workers on one runner is not available. And parallel efficiency at cores/2 is already ~97%, so the only remaining lever is more machines.

This repository is public, so standard runners are free and unmetered while larger runners are billed even on public repos. That inverts the usual advice: the ecosystem's rule of thumb is not to shard under ~200 tests or ~10 minutes, and tldraw at similar scale reaches for an 8-core runner instead. Here the extra runners cost nothing and the bigger one costs money.

Three specifically. The `e2e` job is 257s today — 202s of tests on 55s of fixed setup — and ticket 04 takes the `verify` path to ~134s:

```
shards   slowest shard        vs the ~134s cap
  1        202 + 55 = 257s     over
  2        101 + 55 = 156s     over
  3         67 + 55 = 122s     under  ← take this
  4         50 + 55 = 105s     under, buys nothing
```

`fullyParallel: true` is already set, so Playwright shards at test level rather than file level — confirmed, `--shard=i/3 --list` gives 52/52/52 despite `editing.spec.ts` holding 73 of the 156 tests and 189s of the 382s. Without that the largest file would pin one shard and the split would be worthless.

## What this does not need

**No merge job.** Ticket 02 is what removes the need for one, and that is the point of doing it first. A matrix reports one result to the gate, so `ci` needs no new dependency and nothing pays checkout and install a fourth time on the critical path.

**No container change.** Dropping the Playwright image would save ~25s per shard, taking each to ~95s — under a cap that is already ~134s, so it buys zero wall clock while reversing the decision `.scratch/ci-e2e-runtime/issues/01` recorded and giving back the `install-deps` failure mode it removed. Leave the image alone. This was considered and rejected on arithmetic, not overlooked.

## What it must carry

Each shard needs its own failure artifact name. `upload-artifact` refuses a second upload under a name already claimed in the same run, and three shards can fail together — which is exactly the run where you want all three reports. The `ladle` job already learned this and its comment says so.

Two ports live under `strictPort`: the E2E hosts start at `E2E_PORT_BASE` and take `+ workerIndex`, and the opt-in PostgreSQL project sits below the base. Sharding does not change a shard's worker count, so the arithmetic holds — but each shard is its own runner, so confirm nothing assumed a single host across the whole run.

## Acceptance criteria

- [x] `e2e` runs as a three-way shard matrix and the `ci` gate still fails if any shard fails. The gate needed no edit: Actions waits for every leg of a matrix and reports one aggregate `needs.e2e.result`, which is `failure` if any shard failed, so the existing loop already covers it. `fail-fast: false` is what keeps that aggregate a clean `failure` rather than a failure beside two cancellations — and what stops a first red shard cancelling the two whose reports you want. A comment in the gate says so.
- [x] Each shard uploads its failure report under a name that cannot collide with another shard's: `playwright-report-shard-${{ matrix.shard }}`.
- [x] A run is green with all 156 tests accounted for across the three shards — **locally**, 52/52/52 and three zero exits. Not yet on a runner; see the note below.
- [ ] **Pending the first green CI run — cannot be closed from a laptop.** The real slowest-shard duration is read off that run and recorded here against the ~122s estimate, in the table style `.scratch/ci-e2e-runtime/issues/01` uses. Read the third bullet under "Measured locally" first: the local timings say the estimate is optimistic.
- [x] `ci.yml` carries a comment saying why three and not two or four (the shard table above, transcribed), and why the container was kept.

## Measured locally — what a laptop can and cannot settle

Three sequential shard runs on the same tree, then the unsharded suite twice for a
baseline in the same session. Every number is a laptop with 4 workers on 4 cores;
**none of it predicts a CI shard's wall clock**, because the point of sharding is
three separate machines and running the thirds one after another on one machine
keeps the total CPU work identical while paying startup three times.

```
                       tests   wall     exit
--shard=1/3               52     98s        0
--shard=2/3               52    107s        0
--shard=3/3               52     76s        0
                         ---
                         156

unsharded (run 1)        155    117s        1   one flake, see below
unsharded (run 2)        156    132s        0
```

**What this does settle**: the split is correct and each third stands alone. 52 + 52 + 52
accounts for all 156 tests with no overlap and no gap, and every shard is green on its own
— which is the thing that had to be true before CI could be asked to do it.

**What it does not settle**: any duration. `pnpm verify` is green (173 files, 2149 passed,
2 skipped), `actionlint 1.7.11` reports the workflow clean, and neither of those is a run.

**One finding worth carrying to the CI run.** Playwright shards by test *count*, not by
duration, and the three thirds are not equal in time: 98/107/76 spans ~30% between fastest
and slowest. The ~122s estimate in "Why" above assumed an even 202/3 = 67s of test time per
shard. Applying the observed proportion instead (107/281 = 38% rather than 33%) puts the
slowest shard nearer 77s of tests on 55s of setup — **~132s, at the ~134s cap rather than
comfortably under it**. And that understates the imbalance, because each local shard's wall
clock includes a fixed startup the small shard pays in full. So do not expect ~122s; expect
low 130s, and read the real number off the run before deciding whether three shards
actually cleared the bar. If they did not, the lever is a fourth shard, not the container.

**One local flake, not caused by this change.** The first unsharded baseline run failed with
155 passed — `editing.spec.ts:174 › inline title editing persists without moving or opening
the Card` — and the immediate rerun was 156 green, as was shard 1/3, which holds all of
`editing.spec.ts`. That path is untouched by this ticket, which reaches only `ci.yml`.
Locally `retries: 0`, so one blip is a red run; CI has `retries: 2` under `failOnFlakyTests`,
which turns the same blip into a red build carrying a trace. Recorded rather than chased —
ticket 01 already failed to reproduce a load-sensitive test in 243 contended attempts, and
one occurrence here is not new evidence.

## Decisions taken while building, with their reasons

**The pnpm store cache stays on one key across all three shards**, which is the opposite call
from the one `ladle` made against `e2e` — and the comment in `ci.yml` says so rather than
leaving a reader to notice the inconsistency. The shards are one job: one image, one `HOME`,
one lockfile hash, one store path, so their archives would be byte-identical and three keys
would buy three copies of the same bytes. Restoring is not racy; only saving is, and
`actions/cache` reserves a key before uploading, so on a cold run the two losers log a 409 and
*skip* the upload rather than spending it and discarding the result. Three keys would instead
put three ~200MB uploads on the critical path of the job whose whole purpose is wall clock.
The 409 is louder than the one `ladle` weighed — two per cold run rather than one — and no
less benign, and it happens only when `pnpm-lock.yaml` moves. Sharing `verify`'s key remains
off the table for the reason `ladle`'s comment already gives.

**Ports needed no change, and the ticket's suspicion was checked rather than assumed.**
`packages/app/e2e/fixtures.ts` starts a Vite host per *test*, on `E2E_PORT_BASE + workerIndex`
with a worker-scoped Vite cache dir; nothing indexes by shard, by run or by anything else that
spans a whole invocation. Sharding does not change a shard's worker count, and each shard is
its own runner besides, so there is nothing for two shards to collide over. A comment beside
the `pnpm e2e` call records the check so the next reader does not have to repeat it.

**No merge job, no blob reporter, no container change** — as specified. Ticket 02 removed the
reporter that would have needed one, and the container was rejected on the arithmetic already
written into `ci.yml`.
