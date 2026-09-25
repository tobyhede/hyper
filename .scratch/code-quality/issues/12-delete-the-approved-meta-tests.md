# 12 — Implement approved test replacements and removals

**What to build:** Implement the approved classifications from ticket 11, preserving meaningful architectural checks and replacing brittle source assertions with tests of observable behavior. Remove redundant tests and support code that nothing else uses.

**Blocked by:** 11 — Classify repository and source-inspecting tests, plus approval of the individual classifications to implement.

**Status:** ready-for-agent

- [ ] Implement only individually approved replacements and removals from ticket 11; leave pending or rejected proposals unchanged.
- [ ] Each replacement exercises the stated behavior and can detect the failure the approved classification identifies before its source-based predecessor is removed.
- [ ] Retained package-boundary, public-export and architectural checks continue to pass.
- [ ] Remove support code used only by deleted tests and update references that would otherwise become misleading.
- [ ] Full project verification passes.
- [ ] Deliver separately from the classification PR. Keep one implementation PR if the approved scope fits a fresh context window; otherwise propose bounded follow-up slices before expanding it.
