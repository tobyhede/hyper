# 18: Eliminate unowned asynchronous React test updates

**Priority:** P2 — test reliability

**Status:** ready-for-agent

**Blocked by:** None

**Problem:** The focused review run passed all 307 tests but emitted 46 React warnings containing `not wrapped in act`. The preceding broader package test run also produced substantial warning noise. This makes failures harder to diagnose and leaves uncertainty about whether assertions observe the final state of the operation they start.

**Scope:** Vitest React component/hook tests and their asynchronous fixtures. This is separate from code-quality 11–12's repository-inspecting tests and from the resolved `react-flow-guidance/01` browser React Flow warning policy. It is not evidence that all reported PR timeouts have one cause.

**What to build:** Identify the actual owners of the late updates and make tests control their lifetime. Repair asynchronous fixtures and assertions at the relevant boundary. Preserve unexpected diagnostics rather than suppressing console output.

- [ ] Capture warning-producing test names and identify the operation still in flight for each distinct cause
- [ ] Await user operations and persistence/placement settlement when those outcomes matter to the test
- [ ] Wrap deliberate external-store publications and controlled promise completions in the appropriate test boundary
- [ ] Keep hook collaborators stable when a test intends one subscription; in particular, avoid rebuilding a rejecting source and observable on every render in the extracted hook failure test
- [ ] Tests clean up subscriptions, deferred work and mounted resources without affecting neighboring tests
- [ ] Add a narrowly scoped assertion against unexpected React update warnings once the affected tests are clean; expected diagnostic tests retain explicit expectations
- [ ] The focused 18-file review selection and the affected broader app/UI suites pass without these warnings

Do not solve this by raising global timeouts, enabling retries, suppressing all `console.error`, or adding arbitrary sleeps. Investigate any remaining timeout independently after warning noise is removed.

**Progress (PR 278, scoped to the hook tests that PR added):** Running `app-hooks.test.tsx`, `app-derivations.test.ts` and `space-set-freshness.test.tsx` together produced one `not wrapped in act` warning before this change and none after. It came from `useReferenceableSpaces > reads nothing while hidden, then once per epoch while shown`. The test published a second epoch in a synchronous `act`, and the read that the epoch started then resolved and called `setSpaces` after the `act` had returned. The test now publishes inside an async `act` that awaits the read the publication started. It also asserts the list that read answers. That test and the failure test (`reports a failed read, answers an empty list, and reads no more while shown`) now hold one stable `source` object for the whole mount. Before, each render built a new object literal, or a new rejecting source and observable, which re-ran the subscribing effect on every render. The failure test now asserts that one read happens. The ticket-19 tests in the same block answer their reads with `Promise.withResolvers` and settle every read inside `act` before teardown. Nothing is suppressed, mocked on `console`, retried or given a longer timeout.

The remaining work (the other warning-producing suites, the capture of their test names, and the narrow guard against unexpected update warnings) is left to a later PR, so this ticket stays open.
