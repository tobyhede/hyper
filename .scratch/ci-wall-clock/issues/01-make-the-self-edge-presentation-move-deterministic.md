# 01 — Make the self-Edge presentation move deterministic

**What to build:** The self-Edge presentation test in `space-routing.spec.ts` passes at any worker count, on a loaded runner as reliably as on an idle one. It waits for the canvas to be ready to present before it presses Present, rather than racing the app's first placement.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

## Why

A local full run at 4 workers failed this test; the same tree at 8 workers passed it. The failure was the presentation never starting at all:

```
expect(page).toHaveURL(expected) failed
Expected: …/graphs/AAAAAAAAQACAAAAAAAAAmA/present/AAAAAAAAQACAAAAAAAAAAg
Received: …/graphs/AAAAAAAAQACAAAAAAAAAmA
Timeout:  5000ms
  - 14 × unexpected value "…/graphs/AAAAAAAAQACAAAAAAAAAmA"
```

The URL never moved for the whole five seconds, so this is not a slow transition that needs a longer timeout — the Present click did not take effect. The test does `page.goto(graph)` and presses Present immediately after, with nothing between them that establishes the Layout has placement and the Graph is presentable. Under CPU contention that window widens, which is consistent with it failing at 4 workers and passing at 8, where each test got a larger share of a less contended machine.

**The evidence is from the pre-merge tree.** It was collected before `f5d4f6c8` landed, when the test asserted the opposite behaviour and was named "adds a same-URL browser entry"; ADR 0081 has since inverted it to "takes no browser entry". The unguarded `goto` → `click` shape survives that rename unchanged, so the concern carries over, but the first job here is to confirm whether it still reproduces on the current tree before changing anything.

This gates ticket 03. Sharding redistributes tests across runners and changes the concurrency each one sees, and `failOnFlakyTests` under CI turns a retry-and-pass into a red build — so a test sensitive to machine load is a broken CI gate the moment the shape of the machine changes.

## Scope

Fix this test. If the same unguarded shape appears in its neighbours, note them in the ticket rather than fixing them here — a sweep is its own ticket, and this one is a prerequisite that should stay small.

Do not reach for a longer timeout. The call log shows a value that never changed, which a longer wait does not help.

## Acceptance criteria

- [ ] The test is run repeatedly under deliberate CPU contention on the current tree, and whether it still reproduces is recorded here either way.
- [ ] If it reproduces: the test waits on a real readiness signal before pressing Present, and the same repeated run under contention is green.
- [ ] If it does not reproduce: the ticket records what in `f5d4f6c8` removed the race, and either closes or narrows to the unguarded shape if that is still present.
- [ ] `pnpm e2e` is green, and the run's worker count is recorded.
- [ ] Any sibling tests sharing the unguarded `goto` → interact shape are listed here, unfixed.
