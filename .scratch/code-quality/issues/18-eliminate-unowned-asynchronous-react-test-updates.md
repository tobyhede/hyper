# 18: Eliminate unowned asynchronous React test updates

**Priority:** P2 — test reliability

**Status:** resolved

**Blocked by:** None

**Problem:** The focused review run passed all 307 tests but emitted 46 React warnings containing `not wrapped in act`. The preceding broader package test run also produced substantial warning noise. This makes failures harder to diagnose and leaves uncertainty about whether assertions observe the final state of the operation they start.

**Scope:** Vitest React component/hook tests and their asynchronous fixtures. This is separate from code-quality 11–12's repository-inspecting tests and from the resolved `react-flow-guidance/01` browser React Flow warning policy. It is not evidence that all reported PR timeouts have one cause.

**What to build:** Identify the actual owners of the late updates and make tests control their lifetime. Repair asynchronous fixtures and assertions at the relevant boundary. Preserve unexpected diagnostics rather than suppressing console output.

- [x] Capture warning-producing test names and identify the operation still in flight for each distinct cause
- [x] Await user operations and persistence/placement settlement when those outcomes matter to the test
- [x] Wrap deliberate external-store publications and controlled promise completions in the appropriate test boundary
- [x] Keep hook collaborators stable when a test intends one subscription; in particular, avoid rebuilding a rejecting source and observable on every render in the extracted hook failure test
- [x] Tests clean up subscriptions, deferred work and mounted resources without affecting neighboring tests
- [x] Add a narrowly scoped assertion against unexpected React update warnings once the affected tests are clean; expected diagnostic tests retain explicit expectations
- [x] The focused 18-file review selection and the affected broader app/UI suites pass without these warnings

Do not solve this by raising global timeouts, enabling retries, suppressing all `console.error`, or adding arbitrary sleeps. Investigate any remaining timeout independently after warning noise is removed.

**Progress (PR 278, scoped to the hook tests that PR added):** Running `app-hooks.test.tsx`, `app-derivations.test.ts` and `space-set-freshness.test.tsx` together produced one `not wrapped in act` warning before this change and none after. It came from `useReferenceableSpaces > reads nothing while hidden, then once per epoch while shown`. The test published a second epoch in a synchronous `act`, and the read that the epoch started then resolved and called `setSpaces` after the `act` had returned. The test now publishes inside an async `act` that awaits the read the publication started. It also asserts the list that read answers. That test and the failure test (`reports a failed read, answers an empty list, and reads no more while shown`) now hold one stable `source` object for the whole mount. Before, each render built a new object literal, or a new rejecting source and observable, which re-ran the subscribing effect on every render. The failure test now asserts that one read happens. The ticket-19 tests in the same block answer their reads with `Promise.withResolvers` and settle every read inside `act` before teardown. Nothing is suppressed, mocked on `console`, retried or given a longer timeout.

## Answer

**Inventory, before and after.** Measured with `pnpm vitest run packages/app/test packages/ui/test packages/react-flow-adapter/test` (129 files), counting the output lines that contain `not wrapped in act` or `not configured to support act`. Before: **786** reports across **136** tests in 10 files (`SpaceApp` 365, `enter-space-resource` 122, `dock-commands` 84, `SpaceCanvas` 71, `edge-authoring-react` 66, `replacement-invalidation` 45, `space-resource-embedded-map` 17, `ResourcesPopover` 8, `EntityActionsMenu` 5, `space-canvas-opening-framing` 3), plus one `not configured` report in `space-resource-authoring`. After: **0**, on three consecutive runs, with 1636 tests passing. A report names the component React re-rendered, not the work that caused it, so the owners were found with a temporary setup file (not committed) that logged the JavaScript stack at each report. One late publication cascades into dozens of component reports, so the 786 came down to a handful of causes:

- **Tests that ended with work still in flight.** A commit still saving, a creation's continuation still owed, a Map switch still placing, a menu still handing focus back. Each test now awaits the outcome a reader would see: `persistence.kind === 'settled'`, the created Resource's title editor holding focus or the Resource drawn, the Map continuation ready again, focus back on the menu's trigger.
- **Deliberate publications outside `act`.** These were `session.submit`, `navigation.selectMap`, `authoring.complete`, `spaces.switchTo`, raw `dispatchEvent` drag frames and bare `element.focus()` calls. Each is now wrapped in `act`, or in an async `act` when it returns a promise, and the waits stay outside the `act`.
- **A mount that finishes on a microtask.** Base UI's slider thumb (the canvas zoom control, `thumbAlignment="edge"`) measures itself on a microtask queued from its mount layout effect. `packages/app/test/settled-mount.ts` renders inside an async `act`, and the canvas harnesses in `SpaceCanvas`, `edge-authoring-react`, `space-canvas-opening-framing` and `space-resource-embedded-map` mount through it. The same boundary owns the Resources list's mount-time Spaces read.
- **A command's answer after the click.** `EntityActionsMenu` sets its confirmation when the command's promise settles, so its test `press` helper clicks inside an async `act`.
- **A waiting query inside `act`.** `findByRole` inside `act` turns the act environment off while it polls. That produced the `not configured` report, and the query now runs before the `act`.
- **One production update with no owner.** `useSpaceResourceTargets` read an empty set of targets for every Space without Space Resources. It then installed a new empty map on a later microtask, which cost an extra render nobody awaited. Now it drops the targets during render when nothing is referenced and reads nothing. `space-resource-targets.test.tsx` has two new tests for this, both red against the previous implementation: "reads nothing and renders once…" and "drops every target on the render that removes the last Space Resource".

**The guard.** `test/support/unowned-react-updates.ts` wraps `console.error` and records only React's two act reports. Every call is still written through with its own arguments. `vitest.setup.ts` installs it for jsdom tests and fails the test from `afterEach`, and also from `afterAll` for anything that lands after a file's last test. With the default `sequence.hooks: 'stack'`, that `afterEach` runs after Testing Library's cleanup. `test/unit/unowned-react-updates.test.ts` holds its narrowness: other diagnostics are neither recorded nor changed. A test that replaces `console.error` with a `mockImplementation` spy takes these reports with it while the spy stands. The one such spy that hid a leak (`SpaceApp` "ends a live Map rename…") now records without replacing.

**Not done here.** Other `console.error` output (for example `enter-space-resource`'s expected "Open Spaces observer failed") is not act noise and is left alone. No timeout, retry, sleep or console suppression was added.
