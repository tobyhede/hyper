# Define camera animation rejection handling

Status: ready-for-human

## Context

React Flow camera operations such as `fitView`, `fitBounds`, `setCenter` and
`zoomTo` return Promises. A proposed containment change attached a rejection
handler to all four paths, but swallowed every rejection without distinguishing
an expected interrupted animation from an unexpected adapter or runtime failure.

ADR 0027 assigns camera ownership and uses the operations as awaitable commands,
but does not define their failure policy. Focused browser coverage proves normal
camera motion; it did not force React Flow to reject a camera operation.

## Question

Are camera animations entirely best-effort, are only interruption or
cancellation failures ignorable, or should unexpected failures be sent through
the application's non-throwing reporting seam?

## Evidence gap

The rejected prototype tests used synthetic rejecting Promise-like values. They
proved that handlers were attached to all four calls, but did not reproduce a
real React Flow interruption in Chromium or distinguish cancellation from an
unexpected fault.

## What the pinned version actually does

Read against `@xyflow/react@12.11.2` and `@xyflow/system@0.0.79`. **Three
distinct failure modes, and only one of them is a rejection.**

**Nothing ever calls `reject`.** Zero occurrences of `reject(` and zero of
`.reject` across both ESM bundles. So there is no deliberate rejection path.

**A rejection is still reachable, by synchronous throw.** `setTransform`,
`scaleTo` and `scaleBy` are `new Promise((resolve) => …)` whose executor calls
straight into d3 — `d3ZoomInstance.interpolate(…).transform(getD3Transition(…),
transform)`. A synchronous throw inside a Promise executor rejects the Promise
whether or not `reject` is named. That rejection is by definition an unexpected
fault, never an interruption, which makes it the exact case a blanket
`.catch(() => undefined)` must not swallow.

**An interrupted animation never settles at all.** `getD3Transition` resolves
via `.on('end', onEnd)`. A superseded d3 transition fires `interrupt`, not
`end`, so the Promise stays pending forever. This is the common case in normal
use, and a rejection handler does nothing about it.

**`fitView` can hang for a second reason.** `useReactFlow().fitView` returns
`fitViewResolver.promise` built by `withResolvers()`, and `resolveFitView()`
begins `if (!panZoom) return` — leaving that Promise pending with no resolver
cleanup. The canvas's `OverviewCamera` calls exactly this `fitView`.

## Where that leaves the question

The question is real and sharper than when it was filed, not answered.

Blanket containment is the wrong answer, but not because rejection is
impossible: it is wrong because the only reachable rejection is a genuine d3
fault that deserves reporting, while the two failure modes that actually occur
in normal use are hangs that `.catch` cannot observe. Containment would
therefore silence the one thing worth hearing and leave both real problems
untouched.

So the policy needs to answer a wider question than the original three options:

- A synchronous d3 fault surfaces as a rejection. Report it through the
  non-throwing reporting seam, or let it reach the console unhandled?
- An interrupted animation never settles. Is any caller allowed to depend on a
  camera Promise resolving? See issue `02`, which is a live consequence.
- `fitView` before `panZoom` exists never settles either. Does the camera seam
  need to tolerate being called too early, or is that a caller ordering rule?

## Correcting the record

A previous revision of this ticket closed it `resolved`, asserting that these
Promises "cannot reject". That was wrong. It rested on grepping
`@xyflow/system` for `withResolvers()` and finding only the definition — but the
call site is in `@xyflow/react`, which was never grepped for it — and on
treating "nothing calls `reject`" as equivalent to "nothing can reject", which
ignores synchronous executor throws. The claim was corrected before merge.

## Acceptance

- Record which camera rejections are expected and which require reporting.
- Decide whether a never-settling camera Promise is a supported outcome, and if
  so forbid chaining required work on one.
- Define whether callers await completion or deliberately fire and contain the
  animation command.
- Use the existing non-throwing reporting approach if unexpected failures need
  visibility.
- Cover each policy branch at the owning camera seam.
- Re-read `setTransform`, `scaleTo`, `scaleBy`, `resolveFitView` and
  `getD3Transition` when the React Flow pin moves; all of the above is a fact
  about 12.11.2 rather than about the library's contract.
