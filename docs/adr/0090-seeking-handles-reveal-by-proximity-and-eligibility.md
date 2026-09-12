# Seeking-end handles reveal by proximity and eligibility

Status: accepted
Refines: 0033, 0087
Related: 0032, 0041

During a connection or reconnect drag, **seeking-end** authoring handles —
targets for an ordinary connect, sources when a `from` endpoint is moved —
become visible only on Things that are both within proximity of the pointer and
eligible for the gesture under `edgeEligibility`. Anchors still render on every
Thing (ADR 0087); only the affordance reveal changes.

ADR 0033 said seeking targets appear on every Thing for the whole drag. That
UI treatment made every Thing a snap surface and showed handles on destinations
the release would refuse. This decision replaces that sentence. Everything else
ADR 0033 binds survives: four Graph-independent handles coloured as the Active
Graph, the side as interaction geometry, Option/Alt empty-drop, and
`isValidConnection` as the release gate.

## Proximity

Proximity is the distance from the live connection pointer to the Thing's
axis-aligned bounds in canvas coordinates. The product radius is **80** canvas
units. Over the body the distance is 0. A Thing outside that magnet shows no
seeking handles for this drag.

## Eligibility

A Thing `edgeEligibility` refuses — for example an exact duplicate Edge — shows
no seeking handles, the same as a far Thing. It is also not
`isConnectableEnd` for the seeking role, so React Flow does not snap onto it.
`isValidConnection` still decides whether release completes the Edit; the
reveal simply matches that answer before release rather than lighting every
Thing and failing only on drop.

Self-edges remain legal (ADR 0032), so the source Thing is eligible when the
pointer is near it.

## What this does not touch

Snap `connectionRadius`, Alt/Option empty-drop, anchor geometry, handle
colour, and the Active Graph as the write target are unchanged. Nothing in the
stored document changes.
