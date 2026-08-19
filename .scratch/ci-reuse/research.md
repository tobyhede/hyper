# Reusing successful CI for an identical Git tree

Date: 2026-08-19

## Question

Can Hyper avoid repeating CI on `main` when the merged tree has already passed
the pull-request workflow, and can it similarly reuse the tested parent of an
automated release commit? Is there an established published action for this?

## Answer

Yes for the ordinary merge case. The published Marketplace action
[`fkirc/skip-duplicate-actions`](https://github.com/marketplace/actions/skip-duplicate-actions)
implements this exact primitive: it queries runs belonging to the current
workflow and treats a successful run with the same Git tree hash as a duplicate.
Its documented use is a small pre-job whose `should_skip` output gates the
expensive jobs, including the pull-request-then-merge case.

It is not an exact replacement for pg-proto's release-commit policy. The action
can backtrack over configured `paths_ignore` changes until it finds a successful
ancestor, but pg-proto deliberately proves more: the PR was opened by
`github-actions[bot]`, its branch starts `release-plz-`, only its explicit set of
release files changed, its sole parent is exactly the PR base, and that parent
has a successful `push` run. Those checks encode trust in a particular release
producer rather than generic duplicate-tree detection.

Recommendation: adopt the published action, pinned to a full commit SHA, for
ordinary PR-to-`main` reuse. Keep release-parent reuse separate and explicit if
Hyper adopts release-plz (or another release bot). Do not broaden ordinary
tree-equivalence into generic ignored-path reuse as part of the first change.

## What pg-proto does

The source workflow's
[`reuse-pr-ci` job](https://github.com/freshtonic/pg-proto/blob/main/.github/workflows/ci.yml)
is fail-open toward testing: it initializes both outputs to `false`, retries
eventually-consistent commit-to-PR association lookup six times, and only emits
`tested=true` after all reuse predicates pass. Failure to prove reuse therefore
runs CI rather than skipping it.

For an ordinary push to `main`, it:

1. Loads the pushed commit and its root tree.
2. Finds the associated merged PR; for a two-parent merge it can temporarily
   fall back to parent 2 while GitHub's association catches up.
3. Loads the PR-head tree, including a base-repository fallback for a deleted
   fork head.
4. Requires both tree SHAs to be equal.
5. Requires a completed, successful `pull_request` run of this same `ci.yml`
   workflow whose `head_sha` is the PR head.

For a release-plz PR, it instead:

1. Runs only for a `github-actions[bot]` PR from a `release-plz-` branch.
2. Rejects changes outside `CHANGELOG.md`, `Cargo.lock`, the root `Cargo.toml`,
   and one-level crate `Cargo.toml` files.
3. Requires the release commit to have exactly one parent and that parent to be
   the PR base.
4. Requires a completed, successful `push` run of `ci.yml` at that parent.

The expensive jobs depend on `reuse-pr-ci` and run under
`always() && needs.reuse-pr-ci.outputs.tested != 'true'`. A final aggregation
job itself always runs and succeeds either from the reused result or only when
every split test job succeeded. That final job is important if one stable check
name is a required branch-protection check.

## Published action

The Marketplace currently lists
[`fkirc/skip-duplicate-actions` v5.3.2](https://github.com/marketplace/actions/skip-duplicate-actions).
Its first-party project documentation says:

- `skip_after_successful_duplicate` defaults to `true`;
- `should_skip` can gate whole jobs or individual steps;
- it only compares runs from the same workflow;
- it identifies duplicates by equal tree hash, so it works across clean merge,
  rebase and squash histories when their resulting files are identical;
- manual, scheduled and merge-queue runs are excluded by default; and
- it also offers ancestor backtracking through `paths`/`paths_ignore`.

This is the established published implementation of the developer's ordinary
merge idea. It is third-party and
[`not certified by GitHub`](https://github.com/marketplace/actions/skip-duplicate-actions),
so Hyper's existing action policy implies reviewing the source and pinning the
chosen release to its immutable commit SHA rather than using `@v5`.

The action's documented permission example grants `actions: write` and
`contents: read`, because the product also supports cancelling runs. Hyper only
needs duplicate detection, so permission requirements should be verified
against the pinned source before adoption; pg-proto's custom implementation
does the read-only operation with `actions: read`, `contents: read`, and
`pull-requests: read`.

## Why the API supports the design

GitHub's
[`Get a commit object` endpoint](https://docs.github.com/en/rest/git/commits#get-a-commit-object)
returns the commit's `tree` object and its parents. This makes a root-tree SHA a
content identity independent of commit message, author, timestamp, or parent
history.

GitHub's
[`List workflow runs for a workflow` endpoint](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow)
accepts `actor`, `branch`, `event`, `head_sha`, and `status` filters and requires
only Actions read permission for fine-grained tokens. A caller must still check
`conclusion == success`: `status=completed` means completion, not success.

The endpoint returns at most 1,000 results for a filtered query. Both pg-proto's
targeted `head_sha` lookup and the published action's workflow-local search
avoid treating repository-wide history as an unbounded proof source.

## Hyper adoption notes

Hyper's current [CI workflow](../../.github/workflows/ci.yml) has four
expensive independent jobs (`verify`, `postgres`, `e2e`, and `ladle`) and no
aggregating required-check job. A safe adoption would:

- add one cheap pre-job on `push` (and leave ordinary PR runs unskipped);
- expose a single boolean result, defaulting to “run tests” on errors;
- add that job to each expensive job's `needs` and condition those jobs on a
  proven duplicate;
- add or preserve one always-running aggregate job if branch protection expects
  a stable successful check when the expensive jobs are skipped;
- retain Hyper's full-SHA pinning rule for the new third-party action; and
- initially omit release-parent and ignored-path behavior, because Hyper's
  current workflow has no release trigger or release-plz-specific trust policy.

There is one operational trade-off: the pre-job consumes a runner startup even
when it saves nothing. Hyper should compare that fixed cost with the avoided
four-job main-branch run after a short trial, while keeping the fallback “run
everything unless reuse is proved.”

## Sources

- [pg-proto CI workflow](https://github.com/freshtonic/pg-proto/blob/main/.github/workflows/ci.yml)
- [Skip Duplicate Actions — Marketplace](https://github.com/marketplace/actions/skip-duplicate-actions)
- [Skip Duplicate Actions — source repository](https://github.com/fkirc/skip-duplicate-actions)
- [GitHub REST: workflow runs](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow)
- [GitHub REST: Git commit objects](https://docs.github.com/en/rest/git/commits#get-a-commit-object)
