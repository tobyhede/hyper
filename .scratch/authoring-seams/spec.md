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
are the same shape at smaller scale. All four issues are resolved; `04` was
split out of `02` and closed at the extracted component's rendered-behaviour
seam.

## Issues

- `01` — one observable-state module; three publishers disagree (resolved)
- `02` — a seam for authoring gestures, so the canvas is testable off-browser
  (resolved). Filed against `GraphView.tsx`, which ADR 0041 renamed to
  `SpaceCanvas.tsx`; re-measured at `562b06c`. Closed by
  `app/src/connection-gesture.ts`, one rule asked by both the live preview and
  the release — which had spelled it out separately, against different inputs,
  with nothing pinning that they agreed. Behaviour unchanged. Its
  `placement-failure` half was resolved earlier by `ab9873c`; its `Arranging…`
  half became `04`. The twenty-prop complaint was ruled out of scope.
- `04` — the "Arranging…" live region is asserted nowhere (resolved). The
  extracted `PlacementPending` component pins the `status` role and visible
  text. It deliberately does not claim to cover `App` selecting that branch.
- `03` — `NavigationState` permits states that mean nothing (resolved). Filed as
  "`Navigation` is shallow"; verification did not support that reading. The
  module is deep — some 56 lines of it are comments recording ADR interactions
  and negative knowledge — and the repetition that looked like shallow members
  is illegal states being excluded by hand on every path. Closed by a
  discriminated union on `mode`, with the original fold-the-setters direction
  rejected in the ticket. Derived reads out of the interface, a reducer, and
  `selectBranch` taking a delta stay parked there.

## Not in scope

Vocabulary and package-boundary cleanups are `.scratch/package-hygiene/`.
The `LayoutStrategy` capability-declaration question is
`.scratch/layout-strategy-contract/`.
