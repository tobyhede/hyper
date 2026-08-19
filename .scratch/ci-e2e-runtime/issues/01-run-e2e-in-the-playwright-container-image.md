# 01 — Run the e2e job in the Playwright container image

**What to build:** CI's `e2e` job stops installing anything from apt. It runs inside Playwright's own container image, which already carries the browsers, their shared libraries and the font set, so the job's only setup is pnpm and the workspace install. A stalled Ubuntu mirror can no longer make the job slow, because nothing in it reaches one.

**Blocked by:** None — can start immediately.

**Status:** resolved — built, and verified green in the container by run 32204750136 on PR #79. Every acceptance criterion is closed; see "Measured" below. Pending review and merge of that PR.

## Why

`pnpm exec playwright install-deps chromium` took **9m49s** on one run, turning a 3m10s job into 12m51s. Across the last 41 successful e2e runs it took 11–23s in forty of them and 589s in one. The cause was not the repo and not the runner's network: apt fetched 21.1 MB from `azure.archive.ubuntu.com` at 36 kB/s, where every other run gets 40 MB/s, and in that same job-minute the `postgres` job pulled from Docker Hub at ~280 MB/s. One mirror, one bad run.

The step is also nearly pointless. On `ubuntu-latest` it installs **no shared libraries at all** — apt reports `0 upgraded, 9 newly installed` and all nine are fonts (Japanese, Chinese, Thai, Cyrillic, unifont, freefont, xfonts). Every library Chromium needs is already on the runner image. The suite has no `toHaveScreenshot` or `toMatchSnapshot` anywhere and its content is English, so those 21.1 MB affect nothing any assertion can see.

The container image is Playwright's documented CI setup and removes the whole class of failure. It is roughly break-even on typical wall clock, not a speed win — see the budget below.

## What replaces what

Four steps go away: the Playwright version resolve, the browser cache, and both conditional install branches. `actions/setup-node` goes too — the image already ships the Node the repo asks for.

The decision-dense part, which is easy to get wrong:

```yaml
container:
  image: mcr.microsoft.com/playwright:v1.61.1-noble
  options: --ipc=host
```

`--ipc=host` comes from Playwright's Docker guidance rather than from its Actions example, which omits it: the default 64 MB `/dev/shm` makes Chromium run out of memory and crash, and under `failOnFlakyTests` a crash is a red build rather than a retry. Do **not** add the `--user 1001` that example does carry — it answers root-owned files in the mounted workspace, which this job does not have, since `upload-artifact` and the cache's save step both run inside the container and the runner is ephemeral.

## Two things this must carry or it regresses

**The pnpm store still needs caching, under its own key.** Dropping `setup-node` drops its `cache: pnpm`, which is what makes `pnpm install --frozen-lockfile` a 3s step today. Replace it with an explicit cache over `pnpm store path`, keyed so it cannot collide with the `verify` job — `verify` resolves its store under `/home/runner/…` and the container resolves it under `/github/home/…`, the `HOME` Actions mounts and sets for every `container:` job, so a shared key would restore each job's archive into the other's wrong path and quietly degrade both.

**The image tag must track `@playwright/test` by hand.** Today the workflow derives the version from `node_modules` for its cache key, so drift is impossible; a literal tag reintroduces it. The mitigation is a comment in `ci.yml`, not a guard step. The image records its own name at build time (`playwright-core mark-docker-image`), so a drifted pair already fails `pnpm e2e` with both the current and required tags printed. A second literal to check would be one more thing to keep in sync, and it would catch the same mistake a minute earlier.

## What was verified about the image

Read from the manifest and config blob on MCR rather than assumed:

- Node 24, installed from NodeSource `node_24.x` — satisfies `engines: ">=24"`.
- `git` and `openssh-client` are present, so `actions/checkout` does a real clone rather than falling back to a tarball.
- `npm` and `yarn` are present; **pnpm is not**, so `pnpm/action-setup` stays.
- `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, and that tree is `chmod -R 777`.
- Built with `playwright-core install --with-deps`, so the libraries and the nine font packages are already in the layers.
- `User` is unset, so it runs as root. `pwuser` (uid 1000) exists but is not the default.
- 929 MB compressed across four layers, 791 MB of it in one.

## The time budget to expect

The container pull cannot be cached and does not need to be. For a `container:` job the image is created during *Initialize containers*, before step 1, so no `actions/cache` step can run early enough to help; runners are fresh VMs with no cross-job image store; and `cache-from: type=gha` is a BuildKit cache for *building* images, not pulling one. Saving a `docker save` tarball into `actions/cache` is worse than the pull and would evict the pnpm store against the 10 GB repo limit.

It should land near **30s**, extrapolated from the `postgres` job's own cold pull on the same runner class: 112.8 MB downloaded at ~280 MB/s but extracted at ~38 MB/s, so extraction dominates, and 929 MB at that rate is ~25s plus under 10s of download.

Against today's 17s of cache-restore-plus-`install-deps` and a 2.4% chance of paying ten minutes, that is break-even in expectation and strictly better in variance.

## Acceptance criteria

- [x] The `e2e` job runs in `mcr.microsoft.com/playwright:v1.61.1-noble` with `--ipc=host`, and no step in it invokes apt.
- [x] The version-resolve step, the browser cache step and both `playwright install` steps are gone, as is `actions/setup-node`.
- [x] The pnpm store is still cached, under a key that cannot collide with the one `verify` uses.
- [x] `ci.yml` comments explain the tag/lockfile coupling and why `--ipc=host` is there, in place of the comments about the browser cache and the apt libraries.
- [x] `verify` and `postgres` are untouched — the diff reaches only the `e2e` job — and `pnpm verify` passes locally (125 files, 1276 passed, 8 skipped).
- [x] `pnpm e2e` passes all 97 tests in both projects **in the container** — `97 passed (1.8m)` on run 32204750136.
- [x] The real *Initialize containers* duration is read off the first green run and recorded here, against the ~30s estimate. It was **32s**.

## Measured — run 32204750136, PR #79

```
                          before (41 runs)      after
Initialize containers     n/a                    32s   ← estimated ~30s
cache restore             5s                      1s   (cold, first run)
install-deps             11–23s, once 589s        —    gone
pnpm install              3s                      5s
pnpm e2e                 142–155s               110s
e2e job total            ~190s                  172s
```

The estimate for the pull was right. The prediction that this would be *break-even to slightly slower* was wrong: the job came out ~18s faster, because `pnpm e2e` itself dropped to 110s — below the whole 142–155s band the previous 41 runs occupied.

That drop is not worker count: the run still reports `Running 97 tests using 2 workers`. The likeliest cause is `--ipc=host`. It was added to prevent Chromium crashing on the default 64MB `/dev/shm`, but the same constraint also makes Chromium fall back to slower disk-backed shared memory for renderer transport, so removing it plausibly speeds the tests as well as stabilising them. **One run is one sample** — treat the 110s as provisional until a few more land, and don't build anything on the causal story without checking it.

One consequence worth carrying forward: `verify` ran 163s against e2e's 172s, so the two jobs are now effectively tied for the critical path. Any further e2e-only optimisation buys almost nothing in total CI wall clock — which is the reason ticket 2 (raising the worker count) was cut, now confirmed by measurement rather than estimate.

## Implementation notes

Two things went in beyond what this ticket specified, both to keep the change consistent with rules the repo already states.

**The image is pinned by digest as well as tag** (`v1.61.1-noble@sha256:5b8f294a…`, the multi-arch index digest). `ci.yml`'s own opening comment argues that a tag can be repointed at new content and a SHA cannot, and pins every action accordingly; a bare mutable tag would have contradicted the file it sits in. The cost is that a Playwright bump now moves two literals. Note the direction that is *not* loud: Docker resolves `repo:tag@digest` by the digest and ignores the tag, so editing only the tag is a silent no-op. The digest is the authoritative half and the comment says so.

**A step asserts the image's Node major against `.node-version`.** Dropping `setup-node` dropped that file as this job's Node pin, and nothing else enforced it — `.npmrc` sets no `engine-strict`, and pnpm 9 does not check `engines` by default, so a `.node-version` bump would have landed while e2e quietly kept running the image's Node. The check reads the file rather than repeating the version, so unlike the rejected Playwright-version guard it adds no literal to maintain.

The Playwright-version guard was still declined, for the reason given above: it would duplicate a version that already exists in two places, to catch a failure that is already loud.
