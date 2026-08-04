# A seam for authoring gestures, so `GraphView` is testable off-browser

Status: needs-triage

## Context

`packages/app/src/components/GraphView.tsx` is 561 lines with twenty props, and
it is not exported from any index. `GraphView.test.tsx` now imports it directly
and covers title and opening gestures, but the structural gesture policy below
still has no off-browser seam.

Alt-drop create-and-connect policy, the empty-canvas hit test
(`document.elementFromPoint`) and the connection-gesture ref that suppresses the
post-connect node click remain behind behavior only Playwright reaches.
`packages/app/e2e/` is 2,742 lines; the component suite does not cover those
structural gestures.

Three user-visible states are tested nowhere at all — not unit, not e2e:
`data-testid="placement-failure"`, `placement-pending`, and `persistence-retry`.

## Direction, to be grilled

A pure module taking structural gesture *facts* — `altKey`, `overEmptyCanvas`,
`toNode`, `fromNode`, flow position — and returning an authoring *intent*.
`GraphView` remains the adapter that supplies facts from the DOM and React Flow;
its existing title/opening component coverage stays where it is.

## What must stay in the browser

Camera behaviour (`OverviewCamera`, `PresentingCamera`) reads viewport width and
height, which are zero in jsdom. Handle geometry needs real `getBoundingClientRect`.
Neither should move; they are genuinely browser-only. Gesture *policy* is not.

## Open questions

- Where does the seam sit — a module in `app`, or does some of it belong in `graph`?
- Do the three untested states get unit cover, e2e cover, or both?
