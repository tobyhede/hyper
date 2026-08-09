# Define camera animation rejection handling

Status: resolved

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

## Answer

**None of the three. The premise is false at the pinned version: these Promises
cannot reject.**

Read against the pinned `@xyflow/react@12.11.2` and its `@xyflow/system@0.0.79`:

- `setTransform`, `scaleTo` and `scaleBy` are built as `new Promise((resolve) =>
  …)`. The executor takes no `reject` parameter, so no rejection path exists.
- `@xyflow/system` defines a `withResolvers()` helper that *does* capture
  `reject`, and never calls it. Dead code.
- Neither package contains a single `reject(` call — zero occurrences in
  `@xyflow/system`, zero in `@xyflow/react`.
- When the camera cannot act, because there is no d3 selection, it returns
  `false` rather than rejecting.

That is exactly why the prototype had to synthesise rejecting thenables and
could not reproduce an interruption in Chromium. It is not hard to trigger; the
library has no code that produces it. An interrupted d3 transition never settles
at all — it does not reject.

So the containment is a handler for an event that cannot occur. It is not
harmless: it is unreachable, therefore untestable except through synthetic
thenables, and it reads as defending a real hazard, so the next reader keeps it
and the next one after that reasons from it. The camera calls stay as plain
`void`, and this question does not need an answer until React Flow's behaviour
changes.

## What would reopen this

React Flow is pinned at 12.11.2 precisely because behaviour is verified against
that release, and this finding is a fact about that release rather than about
the library's contract. Re-read `setTransform`, `scaleTo` and `scaleBy` for a
`reject` path when the pin moves. If a future version can reject, answer the
question above then, at the owning camera seam, with real-browser coverage that
distinguishes cancellation from fault — the acceptance list below still stands
for that case.

- Record which camera rejections are expected and which require reporting.
- Define whether callers await completion or deliberately fire and contain the
  animation command.
- Use the existing non-throwing reporting approach if unexpected failures need
  visibility.
- Cover each policy branch at the owning camera seam.
- Add real-browser coverage for React Flow's rejection mode if it can be
  triggered deterministically.
