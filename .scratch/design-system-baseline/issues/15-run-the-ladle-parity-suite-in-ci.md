# 15 — Run the Ladle parity suite in CI

**What to build:** A fourth CI job that runs `pnpm e2e:ladle` on every push and
pull request, alongside `verify`, `postgres` and `e2e`. ADR 0052 makes a Ladle
behaviour test half of every surface ticket's acceptance evidence; today nothing
but a developer's memory executes it.

**Blocked by:** None — can start immediately.

**Status:** resolved — built on `ci/run-ladle-parity-suite`, green locally. Two
criteria stay open until the branch is pushed and the human sets the branch
protection rule: the first green run's duration and the "required" half of Issue
08's criterion. See "Answer".

## Why this is its own ticket rather than Issue 08's

Issue 08 already owns the criterion, in writing:

> Ladle E2E runs as its own required CI job, and CI fails when any Playwright
> test is flaky even if a diagnostic retry passes.

Issue 08 is blocked by 03, 04, 05, 06, 07, 11 and 14. Every one of those tickets
is required by Issue 13's extraction loop to land a stable story and its Ladle
behaviour test. So the gate arrives *after* six tickets' worth of the evidence it
exists to protect — the evidence accumulates ungated, and the first time anything
executes it is the run that is also meant to prove Issue 08.

Nothing about the job depends on those six tickets. Carving it out costs Issue 08
one criterion and buys six tickets a gate on the day their evidence lands.

**What stays with Issue 08:** the parity inventory, the `@parity:<id>` tags, the
runtime collection validation and `ui:catalog:check`'s traceability enforcement.
This ticket delivers only the job that runs the suite.

## What exists today

- `pnpm e2e:ladle` → `playwright test --config playwright.ladle.config.ts`.
- `playwright.ladle.config.ts` starts `ladle serve --noWatch` on port 61100 and
  runs `packages/app/ladle-e2e/`.
- One spec, `issue-14-workspace-sidebar.spec.ts`, eight tests — the whole of
  Issue 14's Ladle-side parity evidence.
- `.github/workflows/ci.yml` has three jobs: `verify`, `postgres`, `e2e`. None
  of them runs the Ladle config.

**Measured locally, warm:** `8 passed (7.1s)`, 7.66s wall for the whole command.
Expect CI to be slower — a cold Vite dependency optimize for the catalogue, plus
the container pull the `e2e` job already pays ~25–33s for. Budget the job at
under two minutes and record the real first-green number here, the way
`ci-e2e-runtime` Issue 01 recorded its own.

## The job

Clone the `e2e` job's shape. It has already solved every environment question
this one asks, and its reasoning is recorded in `ci.yml`'s own comments and in
`.scratch/ci-e2e-runtime/issues/01-run-e2e-in-the-playwright-container-image.md`.

Carry all four of these, or the job regresses in a way that ticket already
diagnosed:

- **The same pinned container image**, tag *and* digest. Chromium and its shared
  libraries are in the layers; nothing reaches an apt mirror.
- **`options: --ipc=host --init`.** The default 64 MB `/dev/shm` makes Chromium
  run out of memory and crash, and `--init` reaps the orphaned helpers that
  reparent onto a PID 1 that is not ours.
- **The `.node-version` check.** Dropping `actions/setup-node` drops that file as
  the job's Node pin and nothing else enforces it. Read the file; do not repeat
  the version.
- **An explicit pnpm store cache.** `pnpm/action-setup` stays — pnpm is the one
  thing the image lacks.

**The cache key is the one decision with a real trade-off.** A `container:` job
resolves its store under `/github/home/…`, so this job's archive is
interchangeable with the `e2e` job's. Two options, both defensible:

- *Its own key* (`pnpm-store-ladle-…`) — recommended. No save race, at the cost
  of a second copy against the repository's 10 GB cache limit.
- *Share `pnpm-store-e2e-…`* — one copy, but on a cold run both jobs build and
  both try to save it, and the loser logs a 409. Benign, noisy.

Do **not** reuse `verify`'s key: it resolves its store under `/home/runner/…`
and a shared key restores each job's archive into the other's wrong path.

## `verify` does not gain a browser

`pnpm verify` is `typecheck → typecheck:packages → ui:catalog:check → lint →
format:check → test:coverage`. It has never required a browser binary, it runs on
a plain `ubuntu-latest` with no Playwright install and a 15-minute timeout, and
developers run it constantly. Adding a browser suite to it would slow the loop it
is designed to keep fast and would break the CI `verify` job outright.

Two commands, two jobs. That is already Issue 08's written plan.

## Correcting the record on `failOnFlakyTests`

An earlier review reported that `playwright.ladle.config.ts` "fails Issue 08's
own bar" for lacking `failOnFlakyTests`, which `playwright.config.ts` carries.
That reading is wrong on the mechanism: `failOnFlakyTests` changes an outcome
only where a retry can turn a failure into a pass, and the Ladle config sets
`retries: 0`. With no retry there is no green flake. The substantive bar is
already met.

What is genuinely unsettled is which shape the job should take, because Issue
08's criterion is *written in terms of a diagnostic retry* — "even if a
diagnostic retry passes" — and `retries: 0` has none to speak of.

**Recommendation: match `playwright.config.ts`** — `retries: process.env['CI'] ?
2 : 0` paired with `failOnFlakyTests: !!process.env['CI']`. One suite's flake
policy rather than two, a genuine infrastructure blip does not red-build, and a
real flake still fails the run with its retries recorded. `forbidOnly` is already
set the same way in both configs.

The alternative — keep `retries: 0` and add `failOnFlakyTests` as a declarative
no-op — is defensible and cheaper. Pick one deliberately and say which in the
answer, rather than leaving the two configs disagreeing by accident.

## Required is a branch-protection setting, not a file

Issue 08's criterion says "its own **required** CI job". Adding the job to
`ci.yml` makes it *run*; making it required to merge is a GitHub branch
protection rule on `main`, which lives outside the repository and is the human's
to set. Land the job, then ask for the protection rule — and note in the answer
whether it was applied, so Issue 08 can close its criterion against evidence
rather than assumption.

## Acceptance criteria

- [x] `.github/workflows/ci.yml` has a fourth job running `pnpm e2e:ladle` on push and pull request.
- [x] It runs in the same pinned Playwright image, tag and digest, with `--ipc=host --init`, and no step in it invokes apt.
- [x] It carries the `.node-version` assertion and an explicit pnpm store cache whose key cannot collide with `verify`'s.
- [x] The flake policy is one deliberate choice, recorded here, and the two Playwright configs no longer disagree by accident.
- [x] `verify` is untouched and still requires no browser binary.
- [x] The diff reaches `ci.yml` and `playwright.ladle.config.ts` only — no story, no spec and no production module changes.
- [ ] The first green run's real duration is recorded in this ticket against the "under two minutes" budget. — **not knowable yet**: the branch is committed but unpushed, so no CI run exists. Placeholder below.
- [ ] Whether branch protection now requires the job is recorded here. — **not applied**: it is a GitHub setting on `main`, outside the repository, and the human's to set.
- [x] `pnpm verify` and `pnpm e2e:ladle` pass locally, with real output quoted.

## Answer

The job is `ladle`, the fourth in `.github/workflows/ci.yml`, cloned from `e2e`'s
shape: the same `mcr.microsoft.com/playwright:v1.61.1-noble@sha256:5b8f294a…`
image pinned by tag *and* digest, `options: --ipc=host --init`, no
`actions/setup-node`, the `.node-version` assertion carried verbatim, and
`pnpm/action-setup` for the one thing the image lacks. No step invokes apt.
Its comment block does not restate `e2e`'s reasoning — it points at it and then
explains only the three things this job decides for itself: why it exists apart
from `verify`, why it exists apart from `e2e`, and the two literals that differ.

**Why apart from `e2e` and not a second command in the same job.** A red
catalogue and a red application are different diagnoses. Two jobs means the
check name on a pull request already says which one failed, and a Ladle
regression cannot be hidden behind an app failure that ran first.

### Flake policy: match `playwright.config.ts`

Took the recommendation. `playwright.ladle.config.ts` now carries
`failOnFlakyTests: !!process.env['CI']` and `retries: process.env['CI'] ? 2 : 0`,
which is `playwright.config.ts` exactly, and `forbidOnly` was already shared.

The reason is that Issue 08's criterion is written in terms of a diagnostic
retry — "even if a diagnostic retry passes" — and the no-op alternative satisfies
it only by having no retry to speak of. That reads as compliance and isn't;
it leaves the criterion unexercised rather than met. One flake policy across
both suites also means a reader never has to ask which config a Playwright
failure came from before knowing what a green run proves. The cost accepted:
a genuinely broken assertion now costs three attempts rather than one, and the
suite is 8 tests, so the worst case is small.

Nothing about the change alters local behaviour — `process.env['CI']` is unset
on a laptop, so `retries` is still `0` there. Confirmed by running the suite
both ways; the CI-shaped run is quoted below.

**One correction to this ticket's own recommendation.** The paragraph above
argues for the shape partly on the grounds that "a genuine infrastructure blip
does not red-build". That is wrong on the mechanism, in the same way the
`failOnFlakyTests` reading this ticket set out to correct was wrong. In
Playwright 1.61.1 the run's status is computed as

```
this.hasWorkerErrors || this.hasReachedMaxFailures() || hasFailedTests
  || this.config.config.failOnFlakyTests && hasFlakyTests ? 'failed' : 'passed'
```

— `playwright/lib/runner/index.js:5823`. A test that fails once and passes on
retry is precisely what makes `hasFlakyTests` true, so with `failOnFlakyTests`
set the blip still reds the build; it just takes three attempts to get there.
The two settings cannot both mean what the recommendation assumed, and blip
tolerance is not available at all while `failOnFlakyTests` is on.

The choice is unchanged, because it never rested on that. It rests on Issue
08's criterion needing a retry to exist, on one policy across both suites, and
on the diagnosis: under `retries: 0` the `trace: 'on-first-retry'` already in
this config captures nothing, so a red run arrives with no artifact — which
would have made the failure-artifact step below dead weight. The config comment
states those grounds and not the wrong one.

### Cache key: its own, `pnpm-store-ladle-…`

Took the recommendation. `key: pnpm-store-ladle-${{ runner.os }}-${{
hashFiles('pnpm-lock.yaml') }}` with the matching `restore-keys`.

Sharing `pnpm-store-e2e-…` would genuinely work — both are `container:` jobs,
so both resolve the store under `/github/home/…` and the archives really are
interchangeable. It was declined on the cold-run save race: both jobs build the
store, both try to save it, and the loser logs a 409. That is benign, but it is
noise printed on exactly the runs where someone is already reading the log, and
it would be a recurring "is this the problem?" for every future reader. A second
copy against the repository's 10 GB cache limit is the cheaper of the two costs —
the store is small next to that limit, and the two archives are byte-identical
inputs so the second copy is pure duplication rather than growth.

`verify`'s key was never a candidate: it resolves its store under
`/home/runner/…`, so a shared key restores each job's archive into a path the
other never reads.

### Artifact name

`ladle-playwright-report` rather than `e2e`'s `playwright-report`.
`upload-artifact` refuses a second upload under a name already claimed in the
same run, and both browser jobs can fail in one run — sharing the name would
cost whichever finished second its report, on precisely the run where you want
both. With `retries: 2` now in force the `test-results/` half of that upload
finally carries traces (`trace: 'on-first-retry'`), which it could not under
`retries: 0`.

### Measured locally

`pnpm e2e:ladle`, this worktree, warm (`8 passed (9.9s)`, 11.0s wall):

```
Running 8 tests using 4 workers
  ✓  8 …issue-14-workspace-sidebar.spec.ts:155:1 › Workspace Sidebar stories are isolated from the Ladle catalogue (991ms)
  ✓  4 …issue-14-workspace-sidebar.spec.ts:3:1 › Persistence Indicator story renders the production save lifecycle (4.7s)

  8 passed (9.9s)
pnpm e2e:ladle  11.65s user 2.98s system 133% cpu 10.980 total
```

The first run in a fresh worktree, paying the catalogue's Vite dependency
optimize, was `8 passed (13.7s)` and 16.1s wall. Both are slower than the 7.66s
this ticket recorded earlier, on a busier machine; the shape is unchanged.

Under the CI-shaped flake policy (`CI=1`, so `retries: 2` and
`failOnFlakyTests`), `8 passed (9.8s)`, 11.1s wall — no retries consumed.

`pnpm verify`, exit 0:

```
> pnpm typecheck && pnpm typecheck:packages && pnpm ui:catalog:check && pnpm lint && pnpm format:check && pnpm test:coverage
All matched files use Prettier code style!
 Test Files  126 passed (126)
      Tests  1278 passed | 8 skipped (1286)
   Duration  30.03s
```

The workflow YAML parses: `python3 -c "import yaml; yaml.safe_load(...)"` reads
four jobs — `verify`, `postgres`, `e2e`, `ladle` — with the `ladle` container and
its eight steps as written.

### First green CI run — TO BE FILLED IN

The branch is committed and **not pushed**, so no run exists to read. Against
the "under two minutes" budget, the expected shape is ~25–33s of *Initialize
containers* (the pull, from Issue 01's three measured runs) plus ~5s of
`pnpm install` plus the suite. Record the real numbers here once the first green
run lands:

```
Initialize containers   TBD   (Issue 01 measured 25–33s for the same image)
cache restore           TBD
pnpm install            TBD
pnpm e2e:ladle          TBD
ladle job total         TBD   (budget: under 2m)
```

### Branch protection — NOT applied

Adding the job to `ci.yml` makes it *run*. Making it required to merge is a
branch protection rule on `main` in GitHub's settings, which lives outside this
repository and is the human's to apply. **It has not been applied.** Issue 08
cannot close its "own **required** CI job" criterion until it is; when it is
applied, the required check to add is named `ladle`.
