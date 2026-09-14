# 03 — Reduce embedded projection work during parent dragging

**What to build:** Moving a Space Thing through its containing Diagram reuses unchanged embedded content instead of rebuilding that content on every drag update. Preserve live geometry, nested clipping and authoring behaviour, and demonstrate the effect with the established benchmark.

**Blocked by:** 02 — Establish a repeatable Space Thing performance benchmark

**Status:** ready-for-agent

- [ ] Capture the relevant benchmark baseline and projection publication counts before changing the drag path. Hold the state of ticket 01's motion correction constant across before/after comparisons; ticket 01 is not a prerequisite.
- [ ] A pure parent translation preserves embedded node, node-data and Edge identities when their local geometry, content, clipping and capabilities are unchanged. Verify this at the actual parent-drag publication seam, with a regression that fails against unnecessary rebuilding.
- [ ] Parent size or stacking changes, target Diagram or Graph selection, target content edits, changed ancestor clip bounds and recursive embedding changes still invalidate and update every affected projection correctly.
- [ ] Narrow embedding dependencies to the values that affect the projection rather than the whole moving parent object. Preserve identity for unaffected embeddings and avoid propagating unnecessary child publications into the combined canvas inputs.
- [ ] Defer drag-processing work needed only when a gesture settles until that branch is reached, where the baseline identifies avoidable work. Keep live positions responsive and retain existing selection, settled Edit, undo and persistence semantics.
- [ ] Validate parent and embedded-Thing dragging, nested clipping, Open/Close, resizing and target authoring in application and Ladle evidence. No stale content, geometry or interaction callbacks remain after an optimization.
- [ ] Compare representative small and large benchmark scenarios before and after, recording both work reduction and timing variability. Claim timing improvements only where the measurements support them, and investigate material regressions before completion.
- [ ] Keep the current single-canvas subflow model and authored visibility. Visibility filtering, paint simplification and alternative canvas architectures remain separate candidates requiring their own measurement-backed scope.
- [ ] Follow shadcn-first-ui for production surface changes and complete the relevant verification and browser suites. Remove temporary production instrumentation or retain it only through the deliberate diagnostic harness.
