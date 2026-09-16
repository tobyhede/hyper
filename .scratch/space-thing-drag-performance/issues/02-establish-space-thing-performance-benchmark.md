# 02 — Establish a repeatable Space Thing performance benchmark

**What to build:** Provide an unattended, repeatable browser benchmark that shows how Space Thing dragging scales and separates visual alignment defects from scripting, rendering and paint costs. Produce a baseline that later optimizations can be compared against without relying on subjective impressions.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Generate valid aggregate fixtures containing 10, 50, 100 and 500 embedded Things using deterministic inputs. Include sparse and denser Graphs, one and several Open Space Things, and more than one embedding level. Record exact visible and mounted Thing and Edge counts for each scenario.
- [x] Fixtures pass normal domain intake and derive from repository-owned generators. The benchmark uses isolated repositories and starts and stops only its own hosts, leaving human development servers untouched.
- [x] Drive repeatable parent drags, embedded-Thing drags and ordinary Markdown Thing drags. Fix the viewport, zoom, gesture path and sampling method, and record browser version, build mode, machine and CPU configuration with each result.
- [x] Report child-to-parent drift and connector attachment error separately from animation-frame interval distributions, long tasks, scripting, layout, paint, React commits and projection publication counts. Document how instrumentation is collected and account for its overhead rather than treating synchronous geometry sampling as a clean FPS benchmark.
- [x] Include a production-build baseline as well as any development-mode profiling needed to explain component behaviour. Run repeated trials and report distributions and variability rather than a single best result.
- [x] Include a short smoke scenario and a selectable scale matrix so subsequent investigations can rerun only the comparisons they need. Record commands and retain reproducible result artifacts with the measured revision and relevant settings.
- [x] The benchmark can run before or after ticket 01. Record whether the movement correction is present, and compare optimization trials against the same motion treatment and revision baseline. Do not confuse elimination of intentional easing with improved computational throughput.
- [x] Publish the baseline findings and identify the dominant costs supported by traces. The benchmark is a diagnostic tool, not a new timing threshold in CI or a claim that the largest tested scene is a supported capacity limit.
