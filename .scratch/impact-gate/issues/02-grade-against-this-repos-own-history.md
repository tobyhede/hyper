# 02: Grade against this repo's own history, not only the seed curve

**What to build:** both Change impact reports show a percentile grade calibrated against this repository's own landed changes, and state how much weight that history carried. Until now they graded on ImpactGate's shipped seed curve alone, where both branches scored in ticket 01's dry run sit at p99.5, so the grade could not tell a 7.6M change from a 260M one.

Each score needs its own baseline: the with-tests score is graded against a baseline built over every file, and the without-tests score against one built with the same test-exclusion measure config. Otherwise the comparison is between different measures.

**Decision this ticket must take and record:** where the baseline comes from.

- **Rebuilt in CI on every run.** Nothing generated is committed, which is what the repo's rule that generated state is derived from the code favours (ADR 0054, ADR 0056). The cost is a walk of the first-parent mainline (about 510 commits when ticketed) on every PR, and this ticket measures it.
- **Committed baseline file.** A cheap read, but it is generated state that goes stale as `main` moves, so it needs an owner and a refresh trigger.

Choose on measured cost, and record the measurement and method in this ticket, not in source.

**Blocked by:** 01: Land the Impact workflow, scored with and without tests, warn only

**Status:** ready-for-agent

- [x] Both reports grade against a project baseline, and the report says so (not "seed only").
- [x] The without-tests grade uses a baseline built with the same measure config as its score.
- [x] The baseline decision and its measured cost are recorded in this ticket.
- [x] If rebuilt in CI, the job stays within its timeout with margin, and the measured time is recorded.
- [x] If committed, the file's refresh trigger is automated or named, and a stale baseline cannot fail a PR. (Not committed; see the Answer.)
- [x] Enforcement stays `warn`.

## Answer

**Neither option as written: derived in CI and cached.** A push to `main` rebuilds both baselines and saves them to the Actions cache under that commit. A pull request restores the newest cached pair by key prefix and builds its own only when nothing is restored. Nothing generated is committed, and a PR does not pay the rebuild.

Why not rebuild on every PR: measured locally on an Apple M2 (8 cores) with `impact-gate==0.3.2`, `/usr/bin/time -p`, over `main` at `5db6031d`:

| baseline | observations | wall |
|---|---|---|
| with tests | 399 | 78.2s |
| without tests | 362 | 32.7s |

That is 111s together, and 141s measured on CI (below). Paid on every PR, it grows with history, and buys nothing a baseline a few merges old does not also give. A baseline is a sample of the per-change distribution, and a few new observations barely move its percentiles.

Why not commit it: it is generated state that disagrees with `main` from the next merge, which the repo rules out (ADR 0054, ADR 0056), and it would need a bot or a human to refresh it.

The cache key includes a hash of the measure config and the workflow. A change to either makes every cached pair unreachable, so a baseline built under different ignore globs or flags is never graded against. The cost is that a PR touching either file builds its own baseline.

The same local run graded against those baselines (`--curve`, default `K = 200`):

| branch | with tests | without tests |
|---|---|---|
| `ui-fixes` | p91.0 (n=399, w=0.67) | p90.0 (n=362, w=0.64) |
| `database-persistence` | p98.5 (n=399, w=0.67) | p98.4 (n=362, w=0.64) |

The grade now separates the two branches. On the seed alone both were p99.5.

Checked locally: `baseline --base-ref` accepts both a commit SHA (the push path) and `origin/main` (the PR fallback path).

CI measurement, from PR #231's run (https://github.com/tobyhede/hyper/actions/runs/35303231917), which found no cache and built its own pair: the Build baselines step ran 141s (03:26:54Z to 03:29:15Z) on `ubuntu-latest` and wrote 399 and 362 observations, matching the local run. The job took 2m25s end to end, against a `timeout-minutes` of 20. The 2.8x ratio borrowed from `verify` overstated this; the walk ran about 1.3x the laptop time. So a PR that misses the cache pays about two and a half minutes, not five.

Remaining: a push to `main` saving the pair, and a PR run restoring it. Both happen only after this merges.

Known limits, not addressed here:

- Actions evicts a cache unused for 7 days. After a quiet week the first PR builds its own pair (about two and a half minutes, measured above) until the next push to `main` saves one.
- The build walks all of `main`'s history, so its cost grows with the repo. `--max-commits` caps it if that ever matters.
