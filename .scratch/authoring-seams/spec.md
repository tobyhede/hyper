# Authoring seams

Source: `/improve-codebase-architecture` review, 2026-08-04.

Follow-ups in `packages/app` from the review that produced `feat/placement-module`
and `feat/completion-totality`. Two of the review's eight candidates are done:
Placement is one module (`f1936c0`), and a completed Edit's install sequence is
total (`62023a4`). These are what remains in the same layer.

## Why these three

The app's authoring cluster took roughly twenty of the thirty commits before the
review. The recurring shape was a rule that belonged in one place living in
several, and being re-fixed each time it broke somewhere new. Placement was the
worst case — five fixes to one concept, two of them 43 minutes apart. These three
are the same shape at smaller scale.

## Issues

- `01` — one observable-state module; three publishers disagree
- `02` — a seam for authoring gestures, so `GraphView` is testable off-browser
- `03` — `Navigation` is shallow

## Not in scope

Vocabulary and package-boundary cleanups are `.scratch/package-hygiene/`.
The `LayoutStrategy` capability-declaration question is
`.scratch/layout-strategy-contract/`.
