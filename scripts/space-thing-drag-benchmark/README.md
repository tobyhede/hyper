# Space Thing drag benchmark

This diagnostic benchmark creates valid, deterministic aggregates and measures real React Flow drag gestures in an isolated browser and memory repository. It is not a CI timing gate and its largest scenario is not a supported-capacity claim.

## Scenarios

Choose one value from each dimension:

- `BENCHMARK_SCALE`: `10`, `50`, `100`, or `500` embedded Markdown Things
- `BENCHMARK_DENSITY`: `sparse` or `dense`
- `BENCHMARK_OPEN_PARENTS`: `1` or `3`

Every scenario includes an ordinary Markdown Thing, the selected number of Open Space Things and a second Space Thing embedding level. The generator validates the complete aggregate through normal intake. The browser asserts exact mounted and visible Thing and Edge counts before measuring.

Generate a scenario from the repository root:

```sh
BENCHMARK_SCALE=10 BENCHMARK_DENSITY=sparse BENCHMARK_OPEN_PARENTS=1 \
  pnpm exec tsx scripts/space-thing-drag-benchmark/generate.ts
```

The command reports the generated directory. Pass its absolute path when running the browser benchmark:

```sh
BENCHMARK_DIRECTORY=/absolute/path/to/.scratch/space-thing-drag-performance/generated/10-sparse-1 \
BENCHMARK_SCALE=10 BENCHMARK_DENSITY=sparse BENCHMARK_OPEN_PARENTS=1 \
BENCHMARK_SCENARIO=10-sparse-1 BENCHMARK_REVISION="$(git rev-parse HEAD)" \
BENCHMARK_MOVEMENT_CORRECTION=present BENCHMARK_BUILD_MODE=development \
  pnpm exec playwright test --config scripts/space-thing-drag-benchmark/playwright.config.ts
```

Use `BENCHMARK_BUILD_MODE=production` to build the application into the ignored benchmark directory and run the same test against Vite preview. Add `--repeat-each=3` or more for a distribution. Playwright attaches `benchmark-result.json` to each test result.

The runner performs the same 161px gesture on the first Space Thing, its first embedded Thing and the ordinary Markdown Thing. During the parent gesture it samples every visible embedded Thing and Edge against the moving parent, reporting follower and connector drift independently. It also records actual embedded-publication counts, frame intervals, observed long tasks, React commit-hook counts, DOM mutation records, Chrome performance-counter deltas for scripting, layout and total task time, and paint duration from a retained DevTools timeline. Geometry sampling, observers, tracing, the commit hook and benchmark instrumentation all add overhead.

## Recorded smoke baseline

Recorded on 2026-09-14 from the `10-sparse-1` scenario on an Apple M2 with eight logical CPUs, Chromium 149, a 1440×1000 viewport and the movement correction present. The scene contained 27 mounted/14 visible Things and 18 mounted/9 visible Edges.

The first production smoke completed in 21.1s, but its earlier drift field compared the parent with itself and is discarded. Three corrected production trials all measured 0px maximum follower drift and 0px maximum connector drift. Their parent gestures held p95 sampled intervals to 17.4–17.6ms, scripting to 0.223–0.227s, total task time to 0.515–0.523s, paint to 0.010s and embedded publications to six. These are instrumented observations, not performance thresholds.

For the projection change, a three-run diagnostic baseline made parent translation part of the projection dependency again while holding the motion correction constant. It produced 29 embedded publications and 84 React commits in every trial, with 0.802–0.826s scripting and 1.103–1.130s task time. The retained projection produced six publications and 60 commits in each of the three corrected production trials above. Development and production timings are not directly comparable; the publication and commit counts demonstrate the removed work, while the production range describes the shipped path. Earlier same-mode development runs reported 1.561s parent-drag scripting and 1.944s task time before retention, then 0.650–0.663s scripting and 0.881–0.906s afterward. All runs produced the same DOM mutation count, which is expected because React Flow must still translate the children.

A representative `100-sparse-1` development comparison mounted 207 Things and 198 Edges, of which 104 Things and 99 Edges were visible. Before projection retention, the parent drag reported 5.018s scripting, 6.109s task time and a 183.4ms p95 sampled frame interval. Afterward it reported 3.254s scripting, 4.248s task time and a 117.4ms p95 interval. Both runs recorded 9,550 DOM mutations, again showing that the optimization reduces application projection work rather than the React Flow translations still required. These are one before/after trial each and remain directional evidence rather than a stable percentage.
