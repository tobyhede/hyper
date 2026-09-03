# 01 — Make the self-Edge presentation move deterministic

**What to build:** The self-Edge presentation test in `space-routing.spec.ts` passes at any worker count, on a loaded runner as reliably as on an idle one. It waits for the canvas to be ready to present before it presses Present, rather than racing the app's first placement.

**Blocked by:** None — can start immediately.

**Status:** resolved — did not reproduce, no test change. 243 contended attempts on the current tree produced zero failures of the recorded kind; the assertion that could observe the race was deleted by `f5d4f6c8` itself. See "Measured" below.

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

## Measured

**243 attempts on the current tree (`66786d1f`), across five configurations, on the same 8-core laptop.** Contention was 8–24 spinning shell loops running alongside the suite; 12 burners takes the one-minute load average past 50, and an unrelated repo's jest workers were also on the machine throughout.

| Attempts | Workers | Burners | Per-test timeout | Result |
| --- | --- | --- | --- | --- |
| 1 | 1 | 0 | 30s (default) | passed (3.7s) |
| 30 | 8 | 0 | 30s | 30 passed |
| 40 | 8 | 16 | 30s | 40 passed |
| 40 | 12 | 24 | 30s | 9 failed, 31 passed |
| 24 | 12 | 24 | 30s | 16 failed, 8 passed |
| 60 | 8 | 8 | 30s | 32 failed, 28 passed |
| 48 | 8 | 12 | **120s** | 48 passed |

**Every one of the 57 failures was `Test timeout of 30000ms exceeded`, and none was the recorded signature.** They are distributed across every step of the test rather than concentrated at the Present click — of the 32 failures in the 8-worker/8-burner run, 14 died inside `page.goto` itself and only 8 at the Present click. The `toHaveURL` errors that appear among them read `Received: ""`, which is a page already torn down by the test timeout, not a live page sitting on the wrong URL. Raising only the per-test budget to 120s and leaving the 5s `expect` timeout alone turned 12 burners at 8 workers from lethal into 48/48 green with **zero** assertion failures — the discriminating experiment: when starvation is no longer able to end the test, nothing else fails.

The recorded failure carries **no** `Test timeout` line, only the 5s `expect` timeout, so it was a healthy test failing an assertion within its budget. Nothing of that kind was produced in 243 attempts.

**A direct probe of the one behaviour a swallowed keystroke would hide.** `usePresentingKeys` binds `ArrowRight` only once `presenting` is true, so a keystroke sent between the URL move and that re-render would be dropped — and the test as written passes either way, because "no browser entry" and "the move never happened" are the same URL. Temporarily asserting that the presenting chrome's Back control exists after the `ArrowRight` (i.e. that the Traversal history really grew) and running 48 more attempts at 8 workers under 12 burners: **48/48 green**. Those 48 are in the 243. So the keystroke is not being swallowed either, at this contention.

**What `f5d4f6c8` changed.** It did not touch the `goto` → click shape, and it changed no timing. It deleted the only assertion in this test that could observe a behaviour-level race:

```diff
-  await page.goBack();
-  await expect(page).toHaveURL(point);
   await expect(page.getByTestId('presenting-chrome')).toBeVisible();
```

Pre-merge, `advance()` pushed a presentation-card entry whenever the Traversal history grew, self-Edge included, and that `goBack()` asserted the resulting duplicate same-URL entry. When the duplicate is absent — because the `ArrowRight` never landed — Back from the single presentation entry goes to the graph URL, and the assertion reports exactly the recorded text: expected the `present/…` URL, received the `graphs/…` URL, polled unchanged for 5s. That is the better fit for the evidence than the Present click, which Playwright auto-waits for (enabled and stable) before it clicks. Under ADR 0081 the self-Edge move earns no entry, so the assertion was replaced by "one Back leaves the presentation" — an outcome that holds whether or not the `ArrowRight` was delivered. The race was removed by removing the observer, not by fixing the timing.

That is worth knowing but is not this ticket's to fix: **the test now passes even if the self-Edge move never happens.** The probe above is what would close that, and it is a change to what the test asserts rather than to when it acts.

**Whole-suite runs.** `pnpm verify` is green (173 test files, 2147 passed, 2 skipped). `pnpm e2e` is green: **156 tests using 4 workers, 156 passed in 2.6m** — 4 workers being exactly the count the original failure was recorded at.

**Not narrowed to the unguarded shape.** The shape is still there, but it is not demonstrably a hazard: Playwright's click waits for enabled and stable, `toHaveURL` polls, and 243 contended attempts produced no behaviour-level failure. What the measurements *did* expose is a different load sensitivity, and it belongs to ticket 03: **the 30s default per-test timeout is what breaks first on a saturated machine**, and it breaks at `page.goto` as readily as anywhere else. A shard landing on a loaded runner will hit that before it hits any readiness race.

### Sibling tests sharing the unguarded shape — listed, not fixed

In `packages/app/e2e/space-routing.spec.ts`:

- `choosing a Space View pushes history and Back, Forward and reload restore it without authoring` — `goto` line 66, click line 71 (the `page.request.get` between them is not a page-readiness wait).
- `history restores a canonical Card through the default Space View, not the context being left` — `goto` line 246, `goBack()` line 247.
- `copy commands distinguish canonical Card identity from its current Space View` — `goto` line 263, node click line 264.
- `activating a Graph pushes a contextual destination restored by Back and Forward` — `goto` line 316, click line 318.
- `Graph copy commands distinguish canonical identity from the current Space View` — `goto` line 336, click line 338.
- `copies the exact current presentation point` — `goto` line 403, click line 405.
- `entering, advancing and retreating each append presentation history` — `goto` line 416, Present click line 418. The identical shape to this ticket's test.

Elsewhere under `packages/app/e2e/`, the same `goto` → interact shape appears in `editing.spec.ts` (lines 1350, 1374, 1393, 1516, 1552, 1566, 1581), `http-persistence.spec.ts` (130, 301), `mobile-sidebar.spec.ts` (110, 126), `new-space.spec.ts` (103, 519, 547) and `presenting.spec.ts` (46, 467).

The counter-example in the same file is `Back or Forward to an unresolved destination shows the destination surface`, which waits on `selected-canvas` being visible before it acts.

## Acceptance criteria

- [x] The test is run repeatedly under deliberate CPU contention on the current tree, and whether it still reproduces is recorded here either way.
- [ ] If it reproduces: the test waits on a real readiness signal before pressing Present, and the same repeated run under contention is green. — not applicable; it did not reproduce.
- [x] If it does not reproduce: the ticket records what in `f5d4f6c8` removed the race, and either closes or narrows to the unguarded shape if that is still present.
- [x] `pnpm e2e` is green, and the run's worker count is recorded.
- [x] Any sibling tests sharing the unguarded `goto` → interact shape are listed here, unfixed.
