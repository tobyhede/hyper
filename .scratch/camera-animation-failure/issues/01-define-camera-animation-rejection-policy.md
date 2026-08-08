# Define camera animation rejection handling

Status: ready-for-human

## Context

React Flow camera operations such as `fitView`, `fitBounds`, `setCenter` and
`zoomTo` return Promises that may reject. A proposed containment change attached
a rejection handler to all four paths, but swallowed every rejection without
distinguishing an expected interrupted animation from an unexpected adapter or
runtime failure.

ADR 0027 assigns camera ownership and uses the operations as awaitable commands,
but does not define their failure policy. Focused browser coverage proves normal
camera motion; it does not force React Flow to reject a camera operation.

## Question

Are camera animations entirely best-effort, are only interruption or
cancellation failures ignorable, or should unexpected failures be sent through
the application's non-throwing reporting seam?

## Evidence gap

The rejected prototype tests used synthetic rejecting Promise-like values. They
proved that handlers were attached to all four calls, but did not reproduce a
real React Flow interruption in Chromium or distinguish cancellation from an
unexpected fault.

## Acceptance

- Record which camera rejections are expected and which require reporting.
- Define whether callers await completion or deliberately fire and contain the
  animation command.
- Use the existing non-throwing reporting approach if unexpected failures need
  visibility.
- Cover each policy branch at the owning camera seam.
- Add real-browser coverage for React Flow's rejection mode if it can be
  triggered deterministically.
- Land the policy and implementation independently from the Route-to-Graph
  vocabulary rename.
