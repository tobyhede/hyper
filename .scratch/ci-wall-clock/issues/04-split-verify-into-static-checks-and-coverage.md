# 04 — Split verify into static checks and coverage

**What to build:** CI runs the `verify` chain as two jobs instead of one serial run, so a red lint and a red test suite are two different check names on the pull request rather than one. `pnpm verify` stays exactly what a developer runs locally.

**Blocked by:** 02 — discharged, and differently than expected. 02 was thought to *add* a parity collection check to `verify` that this ticket would have to place; it did not. The check already lived inside `pnpm ui:catalog:check`, and 02's work was deleting a duplicate reporter. So `ui:catalog:check` is simply one of the eight existing commands and it is placed like any other.

**Status:** resolved — CI runs the chain as `static-checks` (`pnpm verify:static`, the first seven commands) and `coverage` (`pnpm test:coverage`), the `ci` gate requires both, and `pnpm verify` is now defined as those two halves so the list of eight lives only in `package.json`. Two acceptance criteria are **pending a real CI run**; see below.

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

- [x] CI runs the verify chain as two jobs, and the `ci` gate requires both. The `verify` job became `static-checks` and `coverage`; the gate's `needs` list and its result loop name both, so a red half fails _CI passed_ exactly as the one job did.
- [x] `pnpm verify` locally still runs all eight commands, in the current order, with `typecheck:toolchain` first. The run below is the evidence: pnpm prints each nested script's banner, and they come out as `verify` -> `verify:static` -> toolchain, typecheck, typecheck:packages, ui:catalog:check, lint, lint:anti-slop, format:check -> `test:coverage`.
- [x] The eight commands are listed in exactly one place. `verify:static` is the first seven; `verify` is `pnpm verify:static && pnpm test:coverage`; CI's two jobs run `pnpm verify:static` and `pnpm test:coverage`. `ci.yml` names no command from the list at all — and the enumeration that used to sit in the `ladle` job's comment is gone for the same reason.
- [ ] **PENDING a real CI run.** Both jobs' real durations against the ~116s and ~134s estimates. A laptop cannot produce these: the estimates are local costs scaled by the measured ~2.8x plus a runner's checkout, install and cache restore.
- [x] `ci.yml` says why two jobs and not three, on the `static-checks` job: a third job splitting `lint` out gives ~57s, ~87s and ~134s, so the cap is the coverage job either way and the third buys nothing while costing a third install.
- [ ] **PENDING a real CI run.** The overall CI wall clock before and after, together with ticket 03's, as one number. Ticket 03's shard durations are themselves unrecorded until that run, so the combined figure cannot be assembled from a laptop at all.

## Built

`package.json` gained one script and changed one:

```
verify:static  typecheck:toolchain && typecheck && typecheck:packages && ui:catalog:check
               && lint && lint:anti-slop && format:check
verify         verify:static && test:coverage
```

That is the whole of how two places are kept to one. Two other shapes were rejected: CI naming the seven static commands itself is exactly the drift this ticket forbids, and a `verify:coverage` alias beside `verify:static` adds a third spelling of the eighth command to buy nothing but symmetry.

`ci.yml`: the `verify` job became `static-checks`, which runs `pnpm contract:check` (unchanged) and then `pnpm verify:static`. `contract:check` is not part of `verify` and stays in this half because it is another static check of the tree; running it in both halves would pay twice for the same answer. A new `coverage` job repeats that job's checkout / pnpm / setup-node / install preamble and runs `pnpm test:coverage`.

**Cache keys.** `coverage` shares `static-checks`' key, which is the one `setup-node`'s `cache: pnpm` derives from the lockfile. Both are non-container jobs on the same runner image, so both resolve the store under `/home/runner/…` against the same lockfile hash; the archives are byte-identical, and a second key would spend a second copy against the repository's 10 GB limit. `postgres` already shares that key, so this makes four non-container jobs on one key rather than introducing the pattern. On a cold run whichever saves second logs a benign 409 and skips the upload. The `container:` jobs still cannot share it — `/github/home/…` — and their comments now say "the non-container jobs" rather than naming a `verify` job that no longer exists.

**Two invariants read `verify`'s text and had to follow the composition instead.** `test/unit/assertion-ratchet.test.ts` asserted that `verify` runs `pnpm lint` (ADR 0062's ratchet is only a ratchet if `--prune-suppressions` actually runs), and `test/unit/check-typescript-toolchain.test.ts` asserted that `verify` _starts_ with `pnpm typecheck:toolchain`. Both now flatten the chain — a step naming another chain is followed, a step naming a single command is not — so each states the property it always meant rather than the spelling it happened to have, and each still fails if the split moved `lint` out of the chain or put a typecheck ahead of the toolchain assertion.

A third guard, holding `ci.yml`'s two `run:` lines to `verify`'s two halves, was considered and declined: it would assert that a workflow says what it visibly says, and the drift it would catch — a job growing a command of its own — is drift the single `pnpm verify` line was equally exposed to.

**Counts that moved with the job.** `test/unit/ci-container-image-pin.test.ts` asserts how many jobs consume `node-version-file: .node-version`, and the split adds a fifth. Two comment counts in `ci.yml` moved with it: the gate reads five results, and four jobs after `static-checks` carry the `!cancelled()` condition. `AGENTS.md` said "all four jobs" twice and now says five, and its `verify` bullet records the split.

## Verified

- `pnpm verify` — green, 173 files, 2149 passed, 2 skipped, 1:04 total. Its first run was red on the two invariants above; they are fixed and this is the finished tree. Because `verify` now invokes `pnpm verify:static` and `pnpm test:coverage` as their own processes, that one run is also the proof of each CI half: the commands CI issues are literally the ones whose banners appear in the log.
- `pnpm contract:check` — green, so the `static-checks` job's other step still passes.
- `actionlint 1.7.11` — clean on `.github/workflows/ci.yml`. That is also what proves `needs.static-checks.result` is a legal hyphenated property dereference rather than a subtraction.
- **Not run, and why:** `pnpm e2e` and `pnpm e2e:ladle`. The change reaches `.github/**`, `package.json` scripts, three workflow- and manifest-scanning unit tests and two Markdown documents. No browser can observe any of it, and the unit tests that can are inside `pnpm verify`.
- Prettier ignores `**/*.md`, so the "format the Markdown you edited" step is a no-op here; `format:check` inside `verify` confirms nothing is left unformatted.
