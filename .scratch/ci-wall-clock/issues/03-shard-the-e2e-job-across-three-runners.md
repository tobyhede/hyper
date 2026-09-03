# 03 — Shard the e2e job across three runners

**What to build:** CI's `e2e` job becomes a three-way matrix. Each runner executes a third of the suite and is green on its own; a failure in any shard fails the gate and uploads its own report. The suite's wall clock stops being the sum of every test and becomes the slowest third.

**Blocked by:** 01 (a load-sensitive test breaks under a new concurrency shape), 02 (the parity reporter fails any partial run).

**Status:** ready-for-agent

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

- [ ] `e2e` runs as a three-way shard matrix and the `ci` gate still fails if any shard fails.
- [ ] Each shard uploads its failure report under a name that cannot collide with another shard's.
- [ ] A run is green with all 156 tests accounted for across the three shards.
- [ ] The real slowest-shard duration is read off the first green run and recorded here against the ~122s estimate, in the table style `.scratch/ci-e2e-runtime/issues/01` uses.
- [ ] `ci.yml` carries a comment saying why three and not two or four, and why the container was kept.
