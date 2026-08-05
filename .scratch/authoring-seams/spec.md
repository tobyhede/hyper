# Authoring seams

Source: `/improve-codebase-architecture` review, 2026-08-04.

Follow-ups in `packages/app` from the review that produced `feat/placement-module`
and `feat/completion-totality`. Three of the review's eight candidates are done:
Placement is one module (`f1936c0`), a completed Edit's install sequence is
total (`62023a4`), and observable-state notification is one module (`01`). These
are what remains in the same layer.

## Why these three

The app's authoring cluster took roughly twenty of the thirty commits before the
review. The recurring shape was a rule that belonged in one place living in
several, and being re-fixed each time it broke somewhere new. Placement was the
worst case — five fixes to one concept, two of them 43 minutes apart. These three
are the same shape at smaller scale. `01` is now resolved; `02` and `03` remain
open.

## Issues

- `01` — one observable-state module; three publishers disagree (resolved)
- `02` — a seam for authoring gestures, so `GraphView` is testable off-browser
- `03` — `NavigationState` permits states that mean nothing. Filed as
  "`Navigation` is shallow"; verification did not support that reading. The
  module is deep — some 56 lines of it are comments recording ADR interactions
  and negative knowledge — and the repetition that looked like shallow members
  is illegal states being excluded by hand on every path. Now `ready-for-agent`
  against a discriminated union on `mode`, with the original fold-the-setters
  direction rejected in the ticket.

## Not in scope

Vocabulary and package-boundary cleanups are `.scratch/package-hygiene/`.
The `LayoutStrategy` capability-declaration question is
`.scratch/layout-strategy-contract/`.
