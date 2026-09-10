# 14 — Audit canvas decoration invalidation and Active Graph consistency

Status: ready-for-agent
Tags: release/v1
Blocked by: nothing.

**What to build:** A documented, executable account of which inputs refresh
canvas Card operations and how the Dock and canvas agree on the Active Graph.
Fix any reproduced stale publication without sacrificing embedded Layout
correctness or hiding it behind incidental rerenders.

Ticket 11's handoff reports that Card rail actions are rebuilt each render and
that memoizing them breaks six embedded-Layout tests. That is evidence of a
correctness dependency on recomputation, not proof of a particular missing
memo dependency or proof that a per-node cache is the necessary solution.
The current callback is deliberately left unchanged by the regression repair.

The Dock resolves its Active Graph from the published projection while canvas
operations also consume Navigation's Active Graph id. Determine whether a
Layout/Graph transition can make these disagree observably, including a delayed
projection. Separate transitional render state from a persistent wrong command.

- [ ] Reproduce and isolate the reported memoization failures with the existing
      embedded-Layout tests; record the actual invalidation dependency.
- [ ] Measure unnecessary decoration/re-render work before optimizing. Preserve
      correct operations after target load, target edits and session replacement.
- [ ] Exercise Layout/Graph transitions and verify that the Graph named by the
      Dock is the Graph its commands and canvas authoring act on.
- [ ] For every confirmed defect, show a failing regression at the collaborator
      or application seam before the fix, then green afterward.
- [ ] If no observable Active Graph defect exists, document the evidence rather
      than introduce a speculative state owner or cache.
- [ ] Run the relevant embedded-Layout, projection, authoring and application
      suites; record the measured result and any remaining tradeoff.
