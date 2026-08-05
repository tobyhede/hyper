# A seam for authoring gestures, so `GraphView` is testable off-browser

Status: needs-triage

## Context

`packages/app/src/components/GraphView.tsx` is 570 lines with twenty props, and it is not exported from any index — `app` has no index files at all, and its only importers are `App.tsx` and its own test. `GraphView.test.tsx` imports it directly and covers title and opening gestures, but the structural gesture policy below still has no off-browser seam.

Alt-drop create-and-connect policy, the empty-canvas hit test (`document.elementFromPoint`) and the connection-gesture ref remain behind behavior only Playwright reaches. `packages/app/e2e/` is 2,616 lines; the component suite passes inert stubs for `onConnect`, `onConnectEnd`, `onCreateConnectedCard` and `acceptsNewCardTarget`, and never dispatches a connection event.

The ref no longer suppresses a post-connect node click. ADR 0036 removed click-to-open entirely, and `GraphView.tsx:390-396` records that the flag survives only because the Alt listener and the empty-canvas hover tracking read it, "and neither concerns clicks".

Two user-visible states are asserted nowhere — not unit, not e2e:
`data-testid="placement-failure"` and `placement-pending`, both produced only in
`App.tsx`. The decision behind them is covered one seam lower, where
`placement-rendering.test.tsx` pins `canvasContent` returning each of `failure`,
`placeholder` and `arrangement`; what is untested is App's *rendering* of those
branches. `persistence-retry` was listed here as a third and should not have
been — `e2e/http-persistence.spec.ts` locates that button by accessible name,
asserts it visible and clicks it to prove recovery. Only its testid is unused.

Every count above is as of `7fe42e8`. All three in the original filing were
wrong on the day it was written, so re-measure before relying on them.

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
- Do the two unasserted states get unit cover, e2e cover, or both — given their
  `canvasContent` branches are already unit-tested and only the rendering is not?
