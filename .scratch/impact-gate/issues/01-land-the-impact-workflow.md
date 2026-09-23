# 01: Land the Impact workflow, scored with and without tests, warn only

**What to build:** every pull request gets a separate "Change impact" job that scores the PR against its base branch with ImpactGate (https://github.com/officefloor/ImpactGate) twice: once over every changed file, and once with the repo's test homes excluded. Both reports are written to the job summary. The job never fails a PR, posts no PR comment, and is not one of the jobs the `ci` gate depends on.

The workflow and its test-exclusion measure config were drafted and dry-run locally before this ticket and are on this branch uncommitted. What remains is to review, commit, and prove the job on a real pull request.

Why a measure config and not the tool's defaults: ImpactGate's built-in test patterns mark test files but still score them, and its `**/test/**` pattern misses the root `test/` tree, `e2e/` and `ladle-e2e/`. So each test home is named as an ignore glob.

Why not the published GitHub Action: it runs one score per step and does not take a measure config. The CLI is run pinned through `pipx`, which the Ubuntu runner already has, so no third-party action needs a SHA pin.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Scoring runs on `pull_request` only, with full history so the merge-base with the base branch resolves. (Ticket 02 adds a push-to-main run that builds baselines and scores nothing.)
- [x] The job summary carries two clearly labelled reports: with tests, and without tests.
- [x] The without-tests report lists no file under a test home (root `test/`, any package's `test/`, `e2e/`, `ladle-e2e/`, typing fixtures, `*.test.*`, `*.spec.*`).
- [x] Enforcement is `warn`: a change graded over the block percentile still leaves the job green.
- [x] The workflow's permissions are `contents: read` only, and `ci.yml` and its `ci` gate are unchanged.
- [x] The ImpactGate version is pinned.
- [x] `prettier --check` and `actionlint` pass on the new files.
- [x] One real PR run is linked in this ticket's Comments, showing both reports.

## Comments

Local dry run before ticketing, on `ui-fixes` and `database-persistence` vs `main`, graded on the shipped seed curve:

| branch | with tests | without tests |
|---|---|---|
| `ui-fixes` | 7.6M, p99.5, 27 files | 2.3M, p97, 15 files |
| `database-persistence` | 260M, p99.5, 62 files | 120M, p99.5, 30 files |

Implementation. Both run steps were executed locally with a stand-in `GITHUB_STEP_SUMMARY`. Each exited 0 while graded over the block percentile, and the summary carried both labelled reports. ImpactGate prints its own `## Change impact` heading, so the step labels are one level above it (`# With tests`, `# Without tests`), not a second copy.

Test-home exclusion, checked on the JSON report (every `.ts`/`.tsx`/`.js` path in it, matched against the test homes above):

| branch | without tests | with tests (control) |
|---|---|---|
| `ui-fixes` | 12 paths, 0 test | not run |
| `database-persistence` | 17 paths, 0 test | 40 paths, 23 test |

The control shows the check can fail. It is a one-off verification, not a committed test. A unit test would have to reimplement ImpactGate's `fnmatch` semantics in TypeScript, which proves the reimplementation and not the tool.

Review finding, fixed. The score steps pipe into `tee`, and a step with no `shell:` runs as `bash -e`, which has no `pipefail`. A crashed scorer (a failed `pipx` fetch, an unreadable baseline) would have left the step green with an empty report. Both score steps now declare `shell: bash`, which GitHub runs with `-o pipefail`. Control, run locally: `{ echo x; false; } | tee` exits 0 under `bash -e` and 1 under `bash -eo pipefail`. The dry run above set `pipefail` by hand, so its exit codes stand.

First real run: PR #231, https://github.com/tobyhede/hyper/actions/runs/35303231917. Green. Both score steps ran under `bash --noprofile --norc -e -o pipefail`, and each wrote its labelled heading to the summary followed by `**impact-gate:** no source changes to score.` That is correct: the PR changes only YAML and Markdown, which ImpactGate does not score.

Remaining: a run on a PR that changes source, to show both reports with content. The workflow runs only where it exists, so that is the first source-changing PR opened or updated after this merges.

Source-changing run, 2026-09-23: PR #268 at `cab27d23`, https://github.com/tobyhede/hyper/actions/runs/35809090542. Green, and both score steps green. The summary carries both labelled reports with content, each graded against the project baseline:

| report | score | grade | files |
|---|---|---|---|
| with tests | 498,852 | p74.14 (blended n=432, w=0.68) | 9 |
| without tests | 381,192 | p79.99 (blended n=392, w=0.66) | 7 |

The without-tests report names no path under a test home; the two files it lists are `App.tsx` and `CommandDock.tsx`. Read from the run's log with `gh run view --log`.
