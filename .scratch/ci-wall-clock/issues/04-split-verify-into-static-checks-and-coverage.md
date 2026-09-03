# 04 — Split verify into static checks and coverage

**What to build:** CI runs the `verify` chain as two jobs instead of one serial run, so a red lint and a red test suite are two different check names on the pull request rather than one. `pnpm verify` stays exactly what a developer runs locally.

**Blocked by:** 02 — that ticket adds the parity collection check to `verify`, and this one has to place it in whichever half it belongs to. Drop this edge if 02 is deferred; nothing else couples them.

**Status:** ready-for-agent

## Why

Once ticket 03 lands, `verify` is the whole of CI's wall clock. It is 193s on CI, and it is one serial chain of eight commands with very uneven costs. Measured locally, and on CI where the whole chain is 193s against 69s local — call it ~2.8x:

```
                        local     CI (scaled)
typecheck:toolchain        1s         ~3s
typecheck                  1s         ~3s
typecheck:packages         2s         ~6s
ui:catalog:check           1s         ~3s
lint                      21s        ~59s
lint:anti-slop             1s         ~3s
format:check               4s        ~11s
test:coverage             38s       ~106s
                        -----      ------
                          69s        193s
```

Coverage is over half of it and lint is another third; the other six commands together are about 29s. On top of the chain the job pays ~28s of checkout and install, so the whole of it is ~221s. Two jobs — everything but coverage in one, coverage in the other — each pay that setup once, making the paths ~116s and ~134s rather than one 221s run, which puts the cap at ~134s and just under ticket 03's ~122s shards.

This also matches the reason `ci.yml` already gives for `ladle` being its own job rather than a step in `e2e`: "a red catalogue and a red application are different diagnoses, and the check name on a pull request should say which one failed." A red `tsc` and a red Vitest run are different diagnoses too.

## What must not change

`pnpm verify` remains the single local command with the same eight steps in the same order. This ticket splits how **CI** invokes them, not what a developer runs. If that means CI names the two halves through their own scripts, those scripts compose the existing ones rather than restating the list — two places listing the eight commands is how they drift.

The ordering rationale in `CLAUDE.md` is load-bearing for one pair and must survive: `typecheck:toolchain` runs **first** because a typecheck against the wrong compiler still passes, so proving which `tsc` ran has to happen before trusting what it said. Whichever half carries `typecheck` carries the toolchain assertion ahead of it.

Both halves need the `--prune-suppressions` behaviour to stay correct: the ratchet only shrinks, and it runs as part of `lint`.

## What to weigh before splitting further

Three jobs (static / lint / coverage) would be ~57s, ~87s and ~134s, so the cap is the coverage job either way: the third job buys nothing and costs a third install. Two is the split; say so in the comment.

## Acceptance criteria

- [ ] CI runs the verify chain as two jobs, and the `ci` gate requires both.
- [ ] `pnpm verify` locally still runs all eight commands, in the current order, with `typecheck:toolchain` first.
- [ ] The eight commands are listed in exactly one place; the CI halves compose that list rather than repeating it.
- [ ] Both jobs' real durations are read off the first green run and recorded here against the ~116s and ~134s estimates.
- [ ] `ci.yml` says why two jobs and not three.
- [ ] The overall CI wall clock before and after is recorded, together with ticket 03's, so the combined effect is one number and not two claims.
